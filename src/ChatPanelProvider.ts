import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';

export class ChatPanelProvider {
  public static currentPanels: Map<string, ChatPanelProvider> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly sessionId: string;
  private readonly sessionManager: SessionManager;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sessionId: string, sessionManager: SessionManager) {
    this.panel = panel;
    this.sessionId = sessionId;
    this.sessionManager = sessionManager;

    this.panel.webview.html = this._buildHtml(extensionUri);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'requestInitialState':
          this.panel.webview.postMessage({
            type: 'initialState',
            payload: { sessionId: this.sessionId, status: 'idle' }
          });
          break;

        case 'requestFileSuggestions': {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders) { break; }
          const pattern = new vscode.RelativePattern(folders[0], `**/*${message.query}*`);
          const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);
          const suggestions = uris.map(uri => vscode.workspace.asRelativePath(uri));
          this.panel.webview.postMessage({ type: 'file_suggestions', payload: suggestions });
          break;
        }

        case 'submit': {
          const { text } = message.payload as { text: string; config: { model: string; effort: string } };
          const claudeProcess = this.sessionManager.getSession(this.sessionId);
          claudeProcess?.write(text + '\r');
          break;
        }

        case 'respondToPermission': {
          const claudeProcess = this.sessionManager.getSession(this.sessionId);
          claudeProcess?.respondToPermission(message.allowed as boolean);
          break;
        }
      }
    });

    this.panel.onDidDispose(() => {
      ChatPanelProvider.currentPanels.delete(this.sessionId);
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, sessionId: string, sessionManager: SessionManager): void {
    const existing = ChatPanelProvider.currentPanels.get(sessionId);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'labonairAgent',
      `Agent ${sessionId.slice(0, 6)}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
        ]
      }
    );

    const provider = new ChatPanelProvider(panel, extensionUri, sessionId, sessionManager);
    ChatPanelProvider.currentPanels.set(sessionId, provider);
  }

  private _buildHtml(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Labonair Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
