import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { SidebarProvider } from './SidebarProvider';
import { ChatPanelProvider } from './ChatPanelProvider';

export function activate(context: vscode.ExtensionContext): void {
  const sessionManager = new SessionManager();
  const sidebarProvider = new SidebarProvider(sessionManager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('labonair.views.agentSessions', sidebarProvider),

    vscode.commands.registerCommand('labonair.action.newAgentSession', () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const sessionId = sessionManager.createSession(cwd);
      ChatPanelProvider.createOrShow(context.extensionUri, sessionId);
    }),

    vscode.commands.registerCommand('labonair.action.focusSession', (sessionId: string) => {
      ChatPanelProvider.createOrShow(context.extensionUri, sessionId);
    })
  );
}

export function deactivate(): void {}
