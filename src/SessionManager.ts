import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ClaudeProcess } from './ClaudeProcess';
import { ParsedEvent, SessionStatus } from './shared/types';
import { translateSdkMessage } from './parser/SdkEventTranslator';

export interface SessionState {
  process: ClaudeProcess;
  history: ParsedEvent[];
  rawBuffer: string;
  status: SessionStatus;
  label: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  public isPanelVisible: (sessionId: string) => boolean = () => false;

  private _onDidChangeSessions = new vscode.EventEmitter<void>();
  public readonly onDidChangeSessions = this._onDidChangeSessions.event;

  private _onParsedEvent = new vscode.EventEmitter<{ id: string; event: ParsedEvent }>();
  public readonly onParsedEvent = this._onParsedEvent.event;

  private _onRawOutput = new vscode.EventEmitter<{ id: string; data: string }>();
  public readonly onRawOutput = this._onRawOutput.event;

  createSession(cwd?: string): string {
    const resolvedCwd =
      cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    const id = crypto.randomUUID();
    const claudeProcess = new ClaudeProcess(resolvedCwd);
    const state: SessionState = {
      process: claudeProcess,
      history: [],
      rawBuffer: '',
      status: 'idle',
      label: `Session ${id.slice(0, 6)}`,
    };

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
      state.rawBuffer += data;
      if (state.rawBuffer.length > 512_000) {
        state.rawBuffer = state.rawBuffer.slice(-512_000);
      }
      this._onRawOutput.fire({ id, data });
    });

    this.sessions.set(id, state);
    this._onDidChangeSessions.fire();
    return id;
  }

  async runTurn(sessionId: string, text: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) { return; }

    const userEvent: ParsedEvent = { type: 'user_message', text };
    state.history.push(userEvent);
    this._onParsedEvent.fire({ id: sessionId, event: userEvent });

    state.status = 'working';
    this._onDidChangeSessions.fire();

    try {
      for await (const message of state.process.startTurn(text)) {
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
  }

  respondToPermission(sessionId: string, requestId: string, allowed: boolean): void {
    this.sessions.get(sessionId)?.process.respondToPermission(requestId, allowed);
  }

  private _updateStatus(id: string, state: SessionState, event: ParsedEvent): void {
    const prev = state.status;

    if (event.type === 'session_finished') {
      state.status = 'finished';
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
    }
  }

  deleteSession(id: string): void {
    const state = this.sessions.get(id);
    state?.process.dispose();
    this.sessions.delete(id);
    this._onDidChangeSessions.fire();
  }
}
