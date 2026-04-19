import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { forkSession as sdkForkSession } from '@anthropic-ai/claude-agent-sdk';
import type { EffortLevel, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeProcess, ImageBlock } from './ClaudeProcess';
import { ParsedEvent, SessionStatus, AgentSettings, DEFAULT_AGENT_SETTINGS, McpServerEntry } from './shared/types';
import { translateSdkMessage } from './parser/SdkEventTranslator';

export interface SessionState {
  process: ClaudeProcess;
  history: ParsedEvent[];
  status: SessionStatus;
  label: string;
  parentId?: string;
}

export interface ExportedSession {
  version: 1;
  label: string;
  history: ParsedEvent[];
  exportedAt: string;
}

interface PersistedSession {
  id: string;
  label: string;
  history: ParsedEvent[];
  workspaceRoot: string;
  parentId?: string;
}

const STORAGE_KEY = 'labonair.sessions';

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private apiKey: string | undefined;
  private storageContext: vscode.ExtensionContext | undefined;
  private settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  private currentWorkspaceRoot: string = '';

  public isPanelVisible: (sessionId: string) => boolean = () => false;

  private _onDidChangeSessions = new vscode.EventEmitter<void>();
  public readonly onDidChangeSessions = this._onDidChangeSessions.event;

  private _onParsedEvent = new vscode.EventEmitter<{ id: string; event: ParsedEvent }>();
  public readonly onParsedEvent = this._onParsedEvent.event;

  private _onRawOutput = new vscode.EventEmitter<{ id: string; data: string }>();
  public readonly onRawOutput = this._onRawOutput.event;

  private _onContextUpdate = new vscode.EventEmitter<{ id: string; tokens: number }>();
  public readonly onContextUpdate = this._onContextUpdate.event;

  private _onLabelChanged = new vscode.EventEmitter<{ id: string; label: string }>();
  public readonly onLabelChanged = this._onLabelChanged.event;

  loadSettings(context: vscode.ExtensionContext): void {
    this.settings = context.globalState.get<AgentSettings>('labonair.settings', { ...DEFAULT_AGENT_SETTINGS });
  }

  updateSettings(settings: AgentSettings): void {
    this.settings = { ...settings };
    for (const { state } of this.getAllSessions()) {
      state.process.setTrustedTools(settings.trustedTools ?? []);
    }
  }

  addTrustedTool(toolName: string): void {
    if (!this.settings.trustedTools.includes(toolName)) {
      this.settings.trustedTools = [...this.settings.trustedTools, toolName];
      for (const { state } of this.getAllSessions()) {
        state.process.setTrustedTools(this.settings.trustedTools);
      }
    }
  }

  async forkSession(sessionId: string, title?: string): Promise<string> {
    const sourceState = this.sessions.get(sessionId);
    if (!sourceState) { throw new Error('Session not found'); }

    const result = await sdkForkSession(sessionId, { title });
    const newId = result.sessionId;
    const cwd = this.currentWorkspaceRoot;

    const claudeProcess = new ClaudeProcess(
      cwd,
      this.settings.defaultModel,
      this.settings.permissionMode as PermissionMode,
      this.settings.defaultEffort as EffortLevel,
      this.apiKey,
      this.settings.trustedTools ?? []
    );

    const label = title ?? `${sourceState.label} (fork)`;
    const newState: SessionState = {
      process: claudeProcess,
      history: [...sourceState.history],
      status: 'idle',
      label,
      parentId: sessionId,
    };

    this._wireProcess(newId, claudeProcess, newState);
    this.sessions.set(newId, newState);
    this._onDidChangeSessions.fire();
    await this._persist();
    return newId;
  }

  exportSession(sessionId: string): ExportedSession {
    const state = this.sessions.get(sessionId);
    if (!state) { throw new Error('Session not found'); }
    return {
      version: 1,
      label: state.label,
      history: state.history,
      exportedAt: new Date().toISOString(),
    };
  }

  importSession(data: ExportedSession): string {
    const id = crypto.randomUUID();
    const cwd = this.currentWorkspaceRoot;
    const claudeProcess = new ClaudeProcess(
      cwd,
      this.settings.defaultModel,
      this.settings.permissionMode as PermissionMode,
      this.settings.defaultEffort as EffortLevel,
      this.apiKey,
      this.settings.trustedTools ?? []
    );
    const state: SessionState = {
      process: claudeProcess,
      history: data.history ?? [],
      status: 'finished',
      label: data.label ?? `Imported Session`,
    };
    this._wireProcess(id, claudeProcess, state);
    this.sessions.set(id, state);
    this._onDidChangeSessions.fire();
    this._persist();
    return id;
  }

  async applyMcpServers(sessionId: string, servers: McpServerEntry[]): Promise<void> {
    await this.sessions.get(sessionId)?.process.applyMcpServers(servers);
  }

  getSettings(): AgentSettings { return { ...this.settings }; }

  setApiKey(key: string): void {
    this.apiKey = key;
    for (const { state } of this.getAllSessions()) {
      state.process.setApiKey(key);
    }
  }

  clearApiKey(): void {
    this.apiKey = undefined;
    for (const { state } of this.getAllSessions()) {
      state.process.clearApiKey();
    }
  }

  /** Call once on activate to enable persistence. */
  loadFromStorage(context: vscode.ExtensionContext): void {
    this.storageContext = context;
    this.currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const allPersisted = context.globalState.get<PersistedSession[]>(STORAGE_KEY, []);
    const persisted = allPersisted.filter(s => s.workspaceRoot === this.currentWorkspaceRoot);
    const cwd = this.currentWorkspaceRoot;
    for (const saved of persisted) {
      const claudeProcess = new ClaudeProcess(
        cwd,
        this.settings.defaultModel,
        this.settings.permissionMode as PermissionMode,
        this.settings.defaultEffort as EffortLevel,
        this.apiKey,
        this.settings.trustedTools ?? []
      );
      const state: SessionState = {
        process: claudeProcess,
        history: saved.history,
        status: 'finished',
        label: saved.label,
        parentId: saved.parentId,
      };
      this._wireProcess(saved.id, claudeProcess, state);
      this.sessions.set(saved.id, state);
    }
    if (persisted.length > 0) {
      this._onDidChangeSessions.fire();
    }
  }

  private _persist(): Thenable<void> {
    if (!this.storageContext) { return Promise.resolve(); }
    const otherWorkspaceSessions = this.storageContext.globalState
      .get<PersistedSession[]>(STORAGE_KEY, [])
      .filter(s => s.workspaceRoot !== this.currentWorkspaceRoot);
    const currentWorkspaceSessions: PersistedSession[] = Array.from(this.sessions.entries()).map(([id, state]) => ({
      id,
      label: state.label,
      workspaceRoot: this.currentWorkspaceRoot,
      parentId: state.parentId,
      history: state.history.map(ev => {
        if (ev.type === 'tool_call_output' && ev.output.length > 1000) {
          return { ...ev, output: ev.output.slice(0, 1000) + '\n…(truncated)' };
        }
        return ev;
      }),
    }));
    return this.storageContext.globalState.update(STORAGE_KEY, [...otherWorkspaceSessions, ...currentWorkspaceSessions]);
  }

  createSession(cwd?: string): string {
    const resolvedCwd =
      cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    const id = crypto.randomUUID();
    const claudeProcess = new ClaudeProcess(
      resolvedCwd,
      this.settings.defaultModel,
      this.settings.permissionMode as PermissionMode,
      this.settings.defaultEffort as EffortLevel,
      this.apiKey,
      this.settings.trustedTools ?? []
    );
    const state: SessionState = {
      process: claudeProcess,
      history: [],
      status: 'idle',
      label: `Session ${id.slice(0, 6)}`,
    };

    this._wireProcess(id, claudeProcess, state);
    this.sessions.set(id, state);
    this._onDidChangeSessions.fire();
    this._persist();
    return id;
  }

  private _wireProcess(id: string, claudeProcess: ClaudeProcess, state: SessionState): void {
    claudeProcess.onPermissionRequest(({ requestId, toolName, input }) => {
      const event: ParsedEvent = {
        type: 'permission_request',
        action: toolName,
        context: JSON.stringify(input).slice(0, 200),
        requestId,
      };
      state.history.push(event);
      this._onParsedEvent.fire({ id, event });
      state.status = 'permission_required';
      this._onDidChangeSessions.fire();
      this._maybeNotify(id, state);
    });

    claudeProcess.onRawOutput((data) => {
      this._onRawOutput.fire({ id, data });
    });

    claudeProcess.onHookEvent(({ hookType, message }) => {
      const event: ParsedEvent = { type: 'hook_event', hookType, message };
      state.history.push(event);
      this._onParsedEvent.fire({ id, event });
    });
  }

  async runTurn(sessionId: string, text: string, imageBlocks: ImageBlock[] = []): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) { return; }

    const isFirstTurn = !state.history.some(e => e.type === 'user_message');

    const userEvent: ParsedEvent = { type: 'user_message', text };
    state.history.push(userEvent);
    this._onParsedEvent.fire({ id: sessionId, event: userEvent });

    if (isFirstTurn) {
      state.label = this._generateTitle(text);
      this._onLabelChanged.fire({ id: sessionId, label: state.label });
      this._onDidChangeSessions.fire();
    }

    state.status = 'working';
    this._onDidChangeSessions.fire();

    try {
      for await (const message of state.process.startTurn(text, imageBlocks)) {
        const events = translateSdkMessage(message);
        for (const event of events) {
          state.history.push(event);
          this._onParsedEvent.fire({ id: sessionId, event });
          this._updateStatus(sessionId, state, event);
        }
      }
    } catch (err) {
      state.status = 'error';
      this._onDidChangeSessions.fire();
      this._maybeNotify(sessionId, state);
    }

    await this._persist();
  }

  respondToPermission(sessionId: string, requestId: string, allowed: boolean): void {
    this.sessions.get(sessionId)?.process.respondToPermission(requestId, allowed);
  }

  async interruptSession(sessionId: string): Promise<void> {
    await this.sessions.get(sessionId)?.process.interrupt();
  }

  async setFastMode(sessionId: string, enabled: boolean): Promise<void> {
    await this.sessions.get(sessionId)?.process.setFastMode(enabled);
  }

  async getSupportedCommands(sessionId: string): Promise<{ name: string; description: string; argumentHint: string }[]> {
    const process = this.sessions.get(sessionId)?.process;
    if (!process) { return []; }
    try {
      return await process.getSupportedCommands();
    } catch {
      return [];
    }
  }

  private _updateStatus(id: string, state: SessionState, event: ParsedEvent): void {
    const prev = state.status;

    if (event.type === 'session_finished') {
      state.status = 'finished';
      if (event.inputTokens) {
        this._onContextUpdate.fire({ id, tokens: event.inputTokens });
      }
    } else if (event.type === 'tool_call_end' && event.status === 'failed') {
      state.status = 'error';
    } else if (
      event.type === 'agent_message' ||
      event.type === 'thought' ||
      event.type === 'tool_call_start'
    ) {
      state.status = 'working';
    }

    this._onDidChangeSessions.fire();

    if (state.status !== prev &&
        (state.status === 'finished' || state.status === 'error')) {
      this._maybeNotify(id, state);
    }
  }

  private _maybeNotify(id: string, state: SessionState): void {
    if (this.isPanelVisible(id)) { return; }

    const msg = state.status === 'permission_required'
      ? `Claude: Permission required — ${state.label}`
      : state.status === 'error'
        ? `Claude: Error in ${state.label}`
        : `Claude: ${state.label} finished`;

    vscode.window.showInformationMessage(msg, 'View Agent').then(choice => {
      if (choice === 'View Agent') {
        vscode.commands.executeCommand('labonair.action.focusSession', id);
      }
    });
  }

  private _generateTitle(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= 48) { return clean; }
    const truncated = clean.slice(0, 48);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '…';
  }

  getSession(id: string): ClaudeProcess | undefined {
    return this.sessions.get(id)?.process;
  }

  getSessionState(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): Array<{ id: string; state: SessionState }> {
    return Array.from(this.sessions.entries()).map(([id, state]) => ({ id, state }));
  }

  renameSession(id: string, label: string): void {
    const state = this.sessions.get(id);
    if (state) {
      state.label = label;
      this._onDidChangeSessions.fire();
      this._persist();
    }
  }

  deleteSession(id: string): void {
    const state = this.sessions.get(id);
    state?.process.dispose();
    this.sessions.delete(id);
    this._onDidChangeSessions.fire();
    this._persist();
  }
}
