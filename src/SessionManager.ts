import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ClaudeProcess } from './ClaudeProcess';
import { ParsedEvent, SessionStatus } from './shared/types';
import { ChatPanelProvider } from './ChatPanelProvider';

export interface SessionState {
  process: ClaudeProcess;
  history: ParsedEvent[];
  rawBuffer: string;
  status: SessionStatus;
  label: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

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

    claudeProcess.onData((data) => {
      // Keep raw buffer capped at ~500 KB to avoid unbounded memory growth
      state.rawBuffer += data;
      if (state.rawBuffer.length > 512_000) {
        state.rawBuffer = state.rawBuffer.slice(-512_000);
      }
      this._onRawOutput.fire({ id, data });
    });

    claudeProcess.parser.onParsedEvent((event) => {
      state.history.push(event);
      this._onParsedEvent.fire({ id, event });

      // Derive status from event type
      const prevStatus = state.status;
      if (event.type === 'permission_request') {
        state.status = 'permission_required';
      } else if (event.type === 'session_finished') {
        state.status = 'finished';
      } else if (event.type === 'agent_message' || event.type === 'thought' || event.type === 'tool_call_start') {
        state.status = 'working';
      } else if (event.type === 'tool_call_end' && event.status === 'failed') {
        state.status = 'error';
      }

      this._onDidChangeSessions.fire();

      // Background notification when panel is not visible
      if (state.status !== prevStatus &&
          (state.status === 'permission_required' || state.status === 'finished' || state.status === 'error')) {
        const panel = ChatPanelProvider.currentPanels.get(id);
        if (!panel?.isVisible) {
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
      }
    });

    this.sessions.set(id, state);
    this._onDidChangeSessions.fire();
    return id;
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
