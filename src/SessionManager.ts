import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ClaudeProcess } from './ClaudeProcess';

export class SessionManager {
  private sessions = new Map<string, ClaudeProcess>();

  private _onDidChangeSessions = new vscode.EventEmitter<void>();
  public readonly onDidChangeSessions = this._onDidChangeSessions.event;

  createSession(cwd?: string): string {
    const resolvedCwd =
      cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    const id = crypto.randomUUID();
    const claudeProcess = new ClaudeProcess(resolvedCwd);

    claudeProcess.onData((data) => console.log(`[Session ${id}] RAW`, data));
    claudeProcess.parser.onParsedEvent((event) => {
      console.log(`[Session ${id} Parsed Event]`, JSON.stringify(event));
      if (event.type === 'permission_request') {
        console.log(`[Session ${id}] Auto-approving permission request...`);
        setTimeout(() => {
          claudeProcess.respondToPermission(true);
        }, 1000);
      }
    });

    this.sessions.set(id, claudeProcess);
    this._onDidChangeSessions.fire();
    return id;
  }

  getSession(id: string): ClaudeProcess | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): Array<{ id: string; process: ClaudeProcess }> {
    return Array.from(this.sessions.entries()).map(([id, process]) => ({ id, process }));
  }

  deleteSession(id: string): void {
    const claudeProcess = this.sessions.get(id);
    claudeProcess?.dispose();
    this.sessions.delete(id);
    this._onDidChangeSessions.fire();
  }
}
