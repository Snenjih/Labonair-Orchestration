import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';

export class ChatPanelProvider {
  public static currentPanels: Map<string, ChatPanelProvider> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly sessionId: string;
  private readonly sessionManager: SessionManager;
  private readonly subscriptions: vscode.Disposable[] = [];

  public get isVisible(): boolean {
    return this.panel.visible;
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sessionId: string, sessionManager: SessionManager) {
    this.panel = panel;
    this.sessionId = sessionId;
    this.sessionManager = sessionManager;

    this.panel.webview.html = this._buildHtml(extensionUri);

    // Forward parsed events for this session to the webview in real-time
    this.subscriptions.push(
      sessionManager.onParsedEvent(({ id, event }) => {
        if (id === sessionId) {
          this.panel.webview.postMessage({ type: 'parsed_event', payload: event });
        }
      }),
      sessionManager.onRawOutput(({ id, data }) => {
        if (id === sessionId) {
          this.panel.webview.postMessage({ type: 'raw_output', payload: data });
        }
      })
    );

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'requestInitialState': {
          const state = this.sessionManager.getSessionState(this.sessionId);
          this.panel.webview.postMessage({
            type: 'initialState',
            payload: {
              sessionId: this.sessionId,
              status: state?.status ?? 'idle',
              history: state?.history ?? [],
              rawBuffer: state?.rawBuffer ?? '',
            }
          });
          break;
        }

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
          const { text, config } = message.payload as { text: string; config: { model: string; permissionMode?: string } };
          const claudeProcess = this.sessionManager.getSession(this.sessionId);
          if (config?.model) { claudeProcess?.setModel(config.model); }
          this.sessionManager.runTurn(this.sessionId, text).catch(console.error);
          break;
        }

        case 'respondToPermission': {
          const { requestId, allowed } = message as { requestId: string; allowed: boolean };
          this.sessionManager.respondToPermission(this.sessionId, requestId, allowed);
          break;
        }
      }
    });

    this.panel.onDidDispose(() => {
      ChatPanelProvider.currentPanels.delete(this.sessionId);
      this.subscriptions.forEach(d => d.dispose());
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
