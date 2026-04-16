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
      ChatPanelProvider.createOrShow(context.extensionUri, sessionId, sessionManager);
    }),

    vscode.commands.registerCommand('labonair.action.focusSession', (sessionId: string) => {
      ChatPanelProvider.createOrShow(context.extensionUri, sessionId, sessionManager);
    }),

    vscode.commands.registerCommand('labonair.action.deleteSession', (item: vscode.TreeItem) => {
      const sessionId = item.tooltip as string;
      ChatPanelProvider.currentPanels.get(sessionId); // reveal before dispose if open
      sessionManager.deleteSession(sessionId);
    }),

    vscode.commands.registerCommand('labonair.action.renameSession', async (item: vscode.TreeItem) => {
      const sessionId = item.tooltip as string;
      const current = item.label as string;
      const newName = await vscode.window.showInputBox({
        prompt: 'Rename session',
        value: current,
        validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (newName) {
        sessionManager.renameSession(sessionId, newName.trim());
      }
    })
  );
}

export function deactivate(): void {}
