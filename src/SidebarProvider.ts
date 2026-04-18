import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { SessionStatus } from './shared/types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'labonair.views.agentSessions';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: SessionManager,
  ) {
    sessionManager.onDidChangeSessions(() => this._refresh());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this._buildHtml();
    webviewView.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    this._refresh();
  }

  private _refresh(): void {
    if (!this._view) { return; }
    const sessions = this.sessionManager.getAllSessions().map(({ id, state }) => ({
      id,
      label: state.label,
      status: state.status,
    }));
    this._view.webview.postMessage({ type: 'sessions', payload: sessions });
  }

  private _handleMessage(msg: { type: string; sessionId?: string; label?: string }): void {
    switch (msg.type) {
      case 'newSession':
        vscode.commands.executeCommand('labonair.action.newAgentSession');
        break;
      case 'focusSession':
        if (msg.sessionId) {
          vscode.commands.executeCommand('labonair.action.focusSession', msg.sessionId);
        }
        break;
      case 'deleteSession':
        if (msg.sessionId) {
          vscode.commands.executeCommand('labonair.action.deleteSessionById', msg.sessionId);
        }
        break;
      case 'renameSession':
        if (msg.sessionId && msg.label) {
          this.sessionManager.renameSession(msg.sessionId, msg.label);
        }
        break;
    }
  }

  private _buildHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 8px;
      flex-shrink: 0;
    }
    .header__title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.55;
    }
    .new-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.5;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
    }
    .new-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
    }

    /* ── Session list ── */
    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
    }

    .empty {
      padding: 24px 12px;
      text-align: center;
      font-size: 12px;
      opacity: 0.4;
      line-height: 1.55;
    }

    /* ── Session pill ── */
    .session {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.12s;
      border: 1px solid transparent;
      position: relative;
    }
    .session:hover {
      background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
    }
    .session:hover .session__actions { opacity: 1; }

    /* Status dot */
    .session__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .session__dot--idle     { background: var(--vscode-foreground); opacity: 0.25; }
    .session__dot--working  { background: #4fc1ff; animation: pulse 1.2s ease-in-out infinite; }
    .session__dot--permission_required { background: #ffc107; }
    .session__dot--finished { background: #4ec9b0; }
    .session__dot--error    { background: #f14c4c; }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    .session__info {
      flex: 1;
      min-width: 0;
    }
    .session__label {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session__status {
      font-size: 10px;
      opacity: 0.45;
      margin-top: 1px;
      text-transform: capitalize;
    }

    /* Action buttons (shown on hover) */
    .session__actions {
      display: flex;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.12s;
      flex-shrink: 0;
    }
    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.6;
      cursor: pointer;
      transition: opacity 0.12s, background 0.12s;
    }
    .action-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }
    .action-btn--delete:hover { color: #f14c4c; }

    /* Inline rename input */
    .session__rename {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-focusBorder);
      border-radius: 5px;
      padding: 2px 6px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="header__title">Sessions</span>
    <button class="new-btn" id="newBtn" title="New Session" aria-label="New session">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  <div class="session-list" id="list">
    <p class="empty">No sessions yet.<br/>Click + to start one.</p>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let sessions = [];
    let renamingId = null;

    document.getElementById('newBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'newSession' });
    });

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'sessions') {
        sessions = msg.payload;
        render();
      }
    });

    function statusLabel(s) {
      if (s === 'permission_required') return 'waiting';
      return s;
    }

    function render() {
      const list = document.getElementById('list');
      if (!sessions.length) {
        list.innerHTML = '<p class="empty">No sessions yet.<br/>Click + to start one.</p>';
        return;
      }
      list.innerHTML = sessions.map(s => {
        if (s.id === renamingId) {
          return \`<div class="session" data-id="\${s.id}">
            <span class="session__dot session__dot--\${s.status}"></span>
            <input class="session__rename" id="rename-\${s.id}" value="\${escHtml(s.label)}" />
          </div>\`;
        }
        return \`<div class="session" data-id="\${s.id}">
          <span class="session__dot session__dot--\${s.status}"></span>
          <div class="session__info">
            <div class="session__label">\${escHtml(s.label)}</div>
            <div class="session__status">\${statusLabel(s.status)}</div>
          </div>
          <div class="session__actions">
            <button class="action-btn action-btn--rename" data-id="\${s.id}" title="Rename">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="action-btn action-btn--delete" data-id="\${s.id}" title="Delete">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>\`;
      }).join('');

      // Wire events after render
      list.querySelectorAll('.session').forEach(el => {
        const id = el.dataset.id;

        // Click on pill = focus (if not clicking an action btn)
        el.addEventListener('click', e => {
          if (e.target.closest('.action-btn') || e.target.closest('.session__rename')) { return; }
          vscode.postMessage({ type: 'focusSession', sessionId: id });
        });
      });

      list.querySelectorAll('.action-btn--rename').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          renamingId = btn.dataset.id;
          render();
          const input = document.getElementById('rename-' + btn.dataset.id);
          if (input) {
            input.focus();
            input.select();
            input.addEventListener('keydown', ev => {
              if (ev.key === 'Enter') { commitRename(btn.dataset.id, input.value); }
              if (ev.key === 'Escape') { renamingId = null; render(); }
            });
            input.addEventListener('blur', () => commitRename(btn.dataset.id, input.value));
          }
        });
      });

      list.querySelectorAll('.action-btn--delete').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vscode.postMessage({ type: 'deleteSession', sessionId: btn.dataset.id });
        });
      });
    }

    function commitRename(id, value) {
      const trimmed = value.trim();
      if (trimmed) { vscode.postMessage({ type: 'renameSession', sessionId: id, label: trimmed }); }
      renamingId = null;
      render();
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) { text += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return text;
}
