import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { SidebarProvider } from './SidebarProvider';
import { ChatPanelProvider } from './ChatPanelProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const sessionManager = new SessionManager();

  // Load persisted auth on startup
  const [storedKey, authMode] = await Promise.all([
    context.secrets.get('labonair.apiKey'),
    context.secrets.get('labonair.authMode'),
  ]);
  if (storedKey && authMode !== 'claudeCode') {
    sessionManager.setApiKey(storedKey);
  }
  // If authMode === 'claudeCode', no custom key is set — SDK reads ~/.claude/ credentials.

  // Load persisted settings before restoring sessions (so sessions use correct defaults)
  sessionManager.loadSettings(context);

  // Restore sessions from previous VS Code session
  sessionManager.loadFromStorage(context);

  // Break the circular dependency: SessionManager checks panel visibility
  // via this callback rather than importing ChatPanelProvider directly.
  sessionManager.isPanelVisible = (id) =>
    ChatPanelProvider.currentPanels.get(id)?.isVisible ?? false;

  const sidebarProvider = new SidebarProvider(context.extensionUri, sessionManager, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider),

    vscode.commands.registerCommand('labonair.action.newAgentSession', () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const sessionId = sessionManager.createSession(cwd);
      ChatPanelProvider.createOrShow(context, sessionId, sessionManager);
    }),

    vscode.commands.registerCommand('labonair.action.focusSession', async (sessionId?: string) => {
      if (sessionId) {
        ChatPanelProvider.createOrShow(context, sessionId, sessionManager);
        return;
      }
      const sessions = sessionManager.getAllSessions();
      if (sessions.length === 0) {
        vscode.window.showInformationMessage('No sessions open. Create one with Cmd+Shift+A.');
        return;
      }
      const picks = sessions.map(({ id, state }) => ({
        label: state.label,
        description: state.status,
        id,
      }));
      const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a session to focus' });
      if (pick) {
        ChatPanelProvider.createOrShow(context, pick.id, sessionManager);
      }
    }),

    vscode.commands.registerCommand('labonair.action.deleteSession', (item: vscode.TreeItem) => {
      const sessionId = item.tooltip as string;
      const panel = ChatPanelProvider.currentPanels.get(sessionId);
      if (panel) {
        ChatPanelProvider.currentPanels.delete(sessionId);
        panel.dispose();
      }
      sessionManager.deleteSession(sessionId);
    }),

    vscode.commands.registerCommand('labonair.action.deleteSessionById', (sessionId: string) => {
      const panel = ChatPanelProvider.currentPanels.get(sessionId);
      if (panel) {
        ChatPanelProvider.currentPanels.delete(sessionId);
        panel.dispose();
      }
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
    }),

    vscode.commands.registerCommand('labonair.action.clearApiKey', async () => {
      await context.secrets.delete('labonair.apiKey');
      vscode.window.showInformationMessage('Labonair: API key removed.');
    }),

    vscode.commands.registerCommand('labonair.action.importSession', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'Session JSON': ['json'] },
        title: 'Import Labonair Session',
      });
      if (!uris || uris.length === 0) { return; }
      try {
        const raw = await vscode.workspace.fs.readFile(uris[0]);
        const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
        const newId = sessionManager.importSession(data);
        ChatPanelProvider.createOrShow(context, newId, sessionManager);
      } catch (e) {
        vscode.window.showErrorMessage(`Labonair: Failed to import session — ${e}`);
      }
    })
  );
}

export function deactivate(): void {}
