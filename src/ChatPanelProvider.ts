import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';

export class ChatPanelProvider {
  public static currentPanels: Map<string, ChatPanelProvider> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly sessionId: string;
  private readonly sessionManager: SessionManager;
  private readonly context: vscode.ExtensionContext;
  private readonly subscriptions: vscode.Disposable[] = [];

  public get isVisible(): boolean {
    return this.panel.visible;
  }

  public dispose(): void {
    this.panel.dispose();
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, sessionId: string, sessionManager: SessionManager) {
    this.panel = panel;
    this.context = context;
    this.sessionId = sessionId;
    this.sessionManager = sessionManager;

    this.panel.webview.html = this._buildHtml(context.extensionUri);

    // Forward parsed events and status changes for this session to the webview
    this.subscriptions.push(
      sessionManager.onParsedEvent(({ id, event }) => {
        if (id === sessionId) {
          this.panel.webview.postMessage({ type: 'parsed_event', payload: event });
        }
      }),
      sessionManager.onDidChangeSessions(() => {
        const s = sessionManager.getSessionState(sessionId);
        if (s) {
          this.panel.webview.postMessage({ type: 'status_update', payload: s.status });
        }
      }),
      sessionManager.onContextUpdate(({ id, tokens }) => {
        if (id === sessionId) {
          this.panel.webview.postMessage({ type: 'context_update', payload: tokens });
        }
      })
    );

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'requestInitialState': {
          const state = this.sessionManager.getSessionState(this.sessionId);
          const [apiKey, authMode] = await Promise.all([
            this.context.secrets.get('labonair.apiKey'),
            this.context.secrets.get('labonair.authMode'),
          ]);
          this.panel.webview.postMessage({
            type: 'initialState',
            payload: {
              sessionId: this.sessionId,
              status: state?.status ?? 'idle',
              history: state?.history ?? [],
              hasApiKey: !!apiKey || authMode === 'claudeCode',
              authMode: authMode ?? 'manual',
            }
          });
          break;
        }

        case 'setApiKey': {
          const key = message.payload as string;
          await this.context.secrets.store('labonair.apiKey', key);
          await this.context.secrets.delete('labonair.authMode');
          this.sessionManager.setApiKey(key);
          this.panel.webview.postMessage({ type: 'api_key_saved' });
          break;
        }

        case 'useClaudeCodeAuth': {
          // Store the auth mode flag; remove any manually stored key so the
          // SDK discovers Claude Code's own credentials via settingSources: ['user'].
          await this.context.secrets.store('labonair.authMode', 'claudeCode');
          await this.context.secrets.delete('labonair.apiKey');
          this.sessionManager.clearApiKey();
          this.panel.webview.postMessage({ type: 'api_key_saved' });
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
          const { text, config } = message.payload as { text: string; config: { model: string; effort?: string } };
          const claudeProcess = this.sessionManager.getSession(this.sessionId);
          if (config?.model) { claudeProcess?.setModel(config.model); }
          if (config?.effort) { claudeProcess?.setEffort(config.effort as any); }
          this.sessionManager.runTurn(this.sessionId, text).catch(console.error);
          break;
        }

        case 'respondToPermission': {
          const { requestId, allowed } = message as { requestId: string; allowed: boolean };
          this.sessionManager.respondToPermission(this.sessionId, requestId, allowed);
          break;
        }

        case 'clearHistory': {
          const s = this.sessionManager.getSessionState(this.sessionId);
          if (s) { s.history = []; this.sessionManager['_persist'](); }
          break;
        }

        case 'interrupt': {
          this.sessionManager.getSession(this.sessionId)?.interrupt();
          break;
        }
      }
    });

    this.panel.onDidDispose(() => {
      ChatPanelProvider.currentPanels.delete(this.sessionId);
      this.subscriptions.forEach(d => d.dispose());
    });
  }

  public static createOrShow(context: vscode.ExtensionContext, sessionId: string, sessionManager: SessionManager): void {
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
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')
        ]
      }
    );

    const provider = new ChatPanelProvider(panel, context, sessionId, sessionManager);
    ChatPanelProvider.currentPanels.set(sessionId, provider);
  }

  private _buildHtml(extensionUri: vscode.Uri = this.context.extensionUri): string {
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
