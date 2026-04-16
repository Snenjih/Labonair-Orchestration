import * as vscode from 'vscode';

export class ChatPanelProvider {
  public static currentPanels: Map<string, ChatPanelProvider> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly sessionId: string;

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri, sessionId: string) {
    this.panel = panel;
    this.sessionId = sessionId;

    this.panel.webview.html = '<html><body><h1>Agent UI Loading...</h1></body></html>';

    this.panel.onDidDispose(() => {
      ChatPanelProvider.currentPanels.delete(this.sessionId);
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, sessionId: string): void {
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
      }
    );

    const provider = new ChatPanelProvider(panel, extensionUri, sessionId);
    ChatPanelProvider.currentPanels.set(sessionId, provider);
  }
}
