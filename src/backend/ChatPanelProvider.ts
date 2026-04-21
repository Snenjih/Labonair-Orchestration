import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { ImageBlock } from './ClaudeProcess';
import { DEFAULT_AGENT_SETTINGS, AgentSettings } from '../shared/types';

const CLEAR_COMMAND = { name: 'clear', description: 'Clear conversation history', clientOnly: true };

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
      }),
      sessionManager.onLabelChanged(({ id, label }) => {
        if (id === sessionId) {
          this.panel.title = label;
          this.panel.webview.postMessage({ type: 'label_update', payload: label });
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
          const settings = this.context.globalState.get<AgentSettings>('labonair.settings', DEFAULT_AGENT_SETTINGS);
          this.panel.webview.postMessage({
            type: 'initialState',
            payload: {
              sessionId: this.sessionId,
              status: state?.status ?? 'idle',
              history: state?.history ?? [],
              hasApiKey: !!apiKey || authMode === 'claudeCode',
              authMode: authMode ?? 'manual',
              label: state?.label ?? `Session ${this.sessionId.slice(0, 6)}`,
              defaultModel: settings.defaultModel,
              defaultEffort: settings.defaultEffort,
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

        case 'requestSlashCommands': {
          const sdkCommands = await this.sessionManager.getSupportedCommands(this.sessionId);
          const commands = [
            CLEAR_COMMAND,
            ...sdkCommands.map(c => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
          ];
          this.panel.webview.postMessage({ type: 'slash_commands', payload: commands });
          break;
        }

        case 'requestFileSuggestions': {
          const query: string = message.query ?? '';
          const folders = vscode.workspace.workspaceFolders;
          const base = folders?.[0] ?? null;
          let uris: vscode.Uri[] = [];
          if (base) {
            const glob = query ? `**/*${query}*` : '**/*';
            const pattern = new vscode.RelativePattern(base, glob);
            uris = await vscode.workspace.findFiles(pattern, '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}', 20);
          }
          const suggestions = uris.map(uri => vscode.workspace.asRelativePath(uri));
          this.panel.webview.postMessage({ type: 'file_suggestions', payload: suggestions });
          break;
        }

        case 'submit': {
          const { text, config, images } = message.payload as {
            text: string;
            config: { model: string; effort?: string };
            images?: Array<{ mediaType: string; data: string }>;
          };
          const claudeProcess = this.sessionManager.getSession(this.sessionId);
          if (config?.model) { claudeProcess?.setModel(config.model); }
          if (config?.effort) { claudeProcess?.setEffort(config.effort as any); }
          const imageBlocks: ImageBlock[] = (images ?? []).map(img => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType as ImageBlock['source']['media_type'],
              data: img.data,
            },
          }));
          this.sessionManager.runTurn(this.sessionId, text, imageBlocks).catch(console.error);
          break;
        }

        case 'respondToPermission': {
          const { requestId, allowed } = message as { requestId: string; allowed: boolean };
          this.sessionManager.respondToPermission(this.sessionId, requestId, allowed);
          break;
        }

        case 'respondToQuestion': {
          const { requestId, answer } = message as { requestId: string; answer: string };
          this.sessionManager.respondToQuestion(this.sessionId, requestId, answer);
          break;
        }

        case 'openFile': {
          const { path } = message.payload as { path: string };
          try {
            const uri = vscode.Uri.file(path);
            await vscode.window.showTextDocument(uri, { preserveFocus: false });
          } catch {
            vscode.window.showErrorMessage(`Labonair: Cannot open file — ${path}`);
          }
          break;
        }

        case 'clearHistory': {
          const s = this.sessionManager.getSessionState(this.sessionId);
          if (s) { s.history = []; this.sessionManager['_persist'](); }
          break;
        }

        case 'interrupt': {
          this.sessionManager.interruptSession(this.sessionId).catch(console.error);
          break;
        }

        case 'set_fast_mode': {
          const enabled = message.payload as boolean;
          this.sessionManager.setFastMode(this.sessionId, enabled).catch(console.error);
          break;
        }

        case 'forkSession': {
          try {
            const newId = await this.sessionManager.forkSession(this.sessionId);
            ChatPanelProvider.createOrShow(this.context, newId, this.sessionManager);
          } catch (e) {
            vscode.window.showErrorMessage(`Labonair: Fork failed — ${e}`);
          }
          break;
        }

        case 'exportSession': {
          try {
            const data = this.sessionManager.exportSession(this.sessionId);
            const defaultUri = vscode.Uri.file(`${data.label.replace(/[/\\?%*:|"<>]/g, '-')}.json`);
            const saveUri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: { 'Session JSON': ['json'] },
              title: 'Export Session',
            });
            if (saveUri) {
              await vscode.workspace.fs.writeFile(saveUri, Buffer.from(JSON.stringify(data, null, 2)));
            }
          } catch (e) {
            vscode.window.showErrorMessage(`Labonair: Export failed — ${e}`);
          }
          break;
        }

        case 'exportSessionMarkdown': {
          try {
            const data = this.sessionManager.exportSession(this.sessionId);
            const md = data.history
              .filter(e => e.type === 'user_message' || e.type === 'agent_message')
              .map(e => e.type === 'user_message'
                ? `**User:** ${(e as { text: string }).text}`
                : `**Claude:** ${(e as { text: string }).text}`)
              .join('\n\n');
            const defaultUri = vscode.Uri.file(`${data.label.replace(/[/\\?%*:|"<>]/g, '-')}.md`);
            const saveUri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: { 'Markdown': ['md'] },
              title: 'Export Session as Markdown',
            });
            if (saveUri) {
              await vscode.workspace.fs.writeFile(saveUri, Buffer.from(md));
            }
          } catch (e) {
            vscode.window.showErrorMessage(`Labonair: Export failed — ${e}`);
          }
          break;
        }

        case 'addTrustedTool': {
          const toolName = message.payload as string;
          this.sessionManager.addTrustedTool(toolName);
          const settings = this.sessionManager.getSettings();
          await this.context.globalState.update('labonair.settings', settings);
          break;
        }

        case 'saveMcpServers': {
          const servers = message.payload as import('../shared/types').McpServerEntry[];
          const settings = { ...this.sessionManager.getSettings(), mcpServers: servers };
          this.sessionManager.updateSettings(settings);
          await this.context.globalState.update('labonair.settings', settings);
          this.sessionManager.applyMcpServers(this.sessionId, servers).catch(console.error);
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

    const state = sessionManager.getSessionState(sessionId);
    const panelTitle = state?.label ?? `Agent ${sessionId.slice(0, 6)}`;

    const panel = vscode.window.createWebviewPanel(
      'labonairAgent',
      panelTitle,
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
