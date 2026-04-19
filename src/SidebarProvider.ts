import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { AgentSettings, DEFAULT_AGENT_SETTINGS } from './shared/types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'labonair.views.agentSessions';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: SessionManager,
    private readonly context: vscode.ExtensionContext,
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

    // Send username asynchronously
    this._getGitHubUsername().then(username => {
      this._view?.webview.postMessage({ type: 'username', payload: username });
    });

    // Send current settings
    const settings = this.context.globalState.get<AgentSettings>('labonair.settings', { ...DEFAULT_AGENT_SETTINGS });
    webviewView.webview.postMessage({ type: 'settings', payload: settings });
  }

  private async _getGitHubUsername(): Promise<string> {
    try {
      const session = await vscode.authentication.getSession('github', ['user:email'], { silent: true });
      return session?.account.label ?? 'Labonair-User';
    } catch {
      return 'Labonair-User';
    }
  }

  private _refresh(): void {
    if (!this._view) { return; }
    const sessions = this.sessionManager.getAllSessions().map(({ id, state }) => ({
      id,
      label: state.label,
      status: state.status,
      parentId: state.parentId,
    }));
    this._view.webview.postMessage({ type: 'sessions', payload: sessions });
  }

  private async _handleMessage(msg: { type: string; sessionId?: string; label?: string; settings?: AgentSettings; payload?: unknown }): Promise<void> {
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
      case 'saveSettings':
        if (msg.settings) {
          await this.context.globalState.update('labonair.settings', msg.settings);
          this.sessionManager.updateSettings(msg.settings);
          this._view?.webview.postMessage({ type: 'settings', payload: msg.settings });
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

    /* ── Sessions view ── */
    #sessions-view {
      display: flex;
      flex-direction: column;
      height: 100%;
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

    /* ── Search ── */
    .search-wrap {
      padding: 4px 8px 2px;
      flex-shrink: 0;
    }
    .search-input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 7px;
      padding: 5px 10px 5px 28px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: 9px center;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder, #007acc); }

    /* ── Session list ── */
    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px;
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

    .session__info { flex: 1; min-width: 0; }
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

    /* ── Footer ── */
    .footer {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.07));
      flex-shrink: 0;
    }
    .footer__user {
      display: flex;
      align-items: center;
      gap: 7px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .user-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .user-name {
      font-size: 12px;
      opacity: 0.6;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .footer__settings-btn {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.45;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s, background 0.15s, transform 0.3s;
      flex-shrink: 0;
    }
    .footer__settings-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
    }
    .footer__settings-btn.active {
      opacity: 1;
      transform: rotate(45deg);
    }

    /* ══════════════════════════════════════
       Settings View
    ══════════════════════════════════════ */
    #settings-view {
      display: none;
      flex-direction: column;
      height: 100%;
    }
    #settings-view.visible {
      display: flex;
    }

    .settings-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 10px 8px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.07));
      flex-shrink: 0;
    }
    .settings-back {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.55;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.12s, background 0.12s;
      flex-shrink: 0;
    }
    .settings-back:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); }

    .settings-header__title {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
      flex: 1;
    }

    .save-indicator {
      font-size: 10px;
      color: #4ec9b0;
      opacity: 0;
      transition: opacity 0.3s;
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
    }
    .save-indicator.show { opacity: 1; }

    .settings-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 10px 20px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      scrollbar-width: thin;
      scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
    }

    /* Section */
    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .settings-section__header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.4;
      padding-bottom: 2px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.06));
    }

    /* Field */
    .settings-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .settings-field__label {
      font-size: 12px;
      font-weight: 500;
    }
    .settings-field__hint {
      font-size: 10.5px;
      opacity: 0.45;
      line-height: 1.4;
      margin-top: -2px;
    }

    /* Select */
    .settings-select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 7px;
      padding: 6px 28px 6px 10px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
      width: 100%;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 9px center;
      transition: border-color 0.12s;
    }
    .settings-select:focus {
      border-color: var(--vscode-focusBorder, #007acc);
      outline: none;
    }
    .settings-select:hover {
      border-color: var(--vscode-focusBorder, rgba(255,255,255,0.2));
    }

    /* Effort pills */
    .effort-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .effort-pill {
      flex: 1;
      min-width: 0;
      padding: 5px 4px;
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      text-align: center;
      opacity: 0.55;
      transition: all 0.12s;
      white-space: nowrap;
    }
    .effort-pill:hover {
      opacity: 0.85;
      background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
    }
    .effort-pill.selected {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, #0e639c);
      opacity: 1;
    }

    /* Permission mode options */
    .permission-options {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .permission-option {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 8px 9px;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
    }
    .permission-option:hover {
      background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
    }
    .permission-option.selected {
      background: var(--vscode-button-background, rgba(14,99,156,0.15));
      border-color: var(--vscode-focusBorder, rgba(0,122,204,0.4));
    }
    .permission-option__radio {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-input-border, rgba(255,255,255,0.3));
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 1px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.12s;
    }
    .permission-option.selected .permission-option__radio {
      border-color: var(--vscode-button-background, #0e639c);
    }
    .permission-option.selected .permission-option__radio::after {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-button-background, #0e639c);
    }
    .permission-option__content { flex: 1; min-width: 0; }
    .permission-option__name {
      font-size: 12px;
      font-weight: 500;
      line-height: 1.3;
    }
    .permission-option__desc {
      font-size: 10.5px;
      opacity: 0.45;
      line-height: 1.35;
      margin-top: 2px;
    }
    .permission-option--danger .permission-option__name { color: #f14c4c; }
    .permission-option--danger .permission-option__desc { color: #f14c4c; opacity: 0.6; }

    /* Trusted tool chips */
    .trusted-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .trusted-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 20px;
      background: var(--vscode-badge-background, rgba(14,99,156,0.3));
      color: var(--vscode-badge-foreground, #fff);
      font-size: 11px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .trusted-chip__remove {
      border: none;
      background: none;
      color: inherit;
      cursor: pointer;
      opacity: 0.6;
      padding: 0;
      font-size: 13px;
      line-height: 1;
      margin-left: 1px;
    }
    .trusted-chip__remove:hover { opacity: 1; }
    .trusted-empty {
      font-size: 11px;
      opacity: 0.4;
    }

    /* MCP servers */
    .mcp-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mcp-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 7px;
      font-size: 11px;
    }
    .mcp-item__name { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mcp-item__type { opacity: 0.45; font-size: 10px; text-transform: uppercase; }
    .mcp-toggle {
      width: 28px; height: 16px;
      background: var(--vscode-input-border, #555);
      border-radius: 8px;
      border: none;
      cursor: pointer;
      position: relative;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .mcp-toggle.on { background: var(--vscode-button-background, #0e639c); }
    .mcp-toggle::after {
      content: '';
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #fff;
      position: absolute;
      top: 2px; left: 2px;
      transition: left 0.15s;
    }
    .mcp-toggle.on::after { left: 14px; }
    .mcp-delete {
      border: none; background: none; color: var(--vscode-foreground);
      opacity: 0.4; cursor: pointer; padding: 2px; border-radius: 4px;
      transition: opacity 0.12s, color 0.12s;
    }
    .mcp-delete:hover { opacity: 1; color: #f14c4c; }
    .mcp-add-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 6px 10px;
      background: transparent;
      border: 1px dashed var(--vscode-input-border, rgba(255,255,255,0.15));
      border-radius: 7px;
      color: var(--vscode-foreground);
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      opacity: 0.6;
      width: 100%;
      transition: opacity 0.12s, background 0.12s;
    }
    .mcp-add-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .mcp-form {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-focusBorder, #007acc);
      border-radius: 8px;
    }
    .mcp-form input, .mcp-form select {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 5px;
      padding: 5px 8px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    }
    .mcp-form input:focus, .mcp-form select:focus { border-color: var(--vscode-focusBorder, #007acc); }
    .mcp-form-actions { display: flex; gap: 6px; }
    .mcp-form-actions button {
      flex: 1;
      padding: 5px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
    }
    .mcp-form-actions .btn-save {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .mcp-form-actions .btn-cancel {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.15));
    }

    /* Hooks toggles */
    .hook-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .hook-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .hook-item__label { flex: 1; font-size: 12px; }
    .hook-item__hint { font-size: 10.5px; opacity: 0.4; }

    /* About card */
    .about-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--vscode-input-background, rgba(255,255,255,0.04));
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.07));
      border-radius: 10px;
    }
    .about-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 800;
      flex-shrink: 0;
      letter-spacing: -1px;
    }
    .about-name {
      font-size: 12px;
      font-weight: 600;
    }
    .about-tagline {
      font-size: 10.5px;
      opacity: 0.45;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <!-- ══ Sessions View ══ -->
  <div id="sessions-view">
    <div class="header">
      <span class="header__title">Sessions</span>
      <button class="new-btn" id="newBtn" title="New Session" aria-label="New session">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="search-wrap">
      <input class="search-input" id="searchInput" type="text" placeholder="Search sessions…" aria-label="Search sessions" />
    </div>

    <div class="session-list" id="list">
      <p class="empty">No sessions yet.<br/>Click + to start one.</p>
    </div>

    <div class="footer">
      <div class="footer__user">
        <div class="user-avatar" id="userAvatar">L</div>
        <span class="user-name" id="userName">Labonair-User</span>
      </div>
      <button class="footer__settings-btn" id="settingsBtn" title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- ══ Settings View ══ -->
  <div id="settings-view">
    <div class="settings-header">
      <button class="settings-back" id="backBtn" title="Back to sessions">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span class="settings-header__title">Settings</span>
      <div class="save-indicator" id="saveIndicator">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Saved
      </div>
    </div>

    <div class="settings-body">

      <!-- Model & Performance -->
      <div class="settings-section">
        <div class="settings-section__header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Model &amp; Performance
        </div>

        <div class="settings-field">
          <div class="settings-field__label">Default Model</div>
          <div class="settings-field__hint">Used when opening new sessions</div>
          <select class="settings-select" id="defaultModel">
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 — Fast &amp; efficient</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 — Balanced</option>
            <option value="claude-opus-4-7">Opus 4.7 — Most capable</option>
          </select>
        </div>

        <div class="settings-field">
          <div class="settings-field__label">Default Effort</div>
          <div class="settings-field__hint">Controls reasoning depth per turn</div>
          <div class="effort-pills" id="effortPills">
            <button class="effort-pill" data-value="low">Low</button>
            <button class="effort-pill" data-value="medium">Med</button>
            <button class="effort-pill" data-value="high">High</button>
            <button class="effort-pill" data-value="xhigh">X-Hi</button>
            <button class="effort-pill" data-value="max">Max</button>
          </div>
        </div>
      </div>

      <!-- Behavior -->
      <div class="settings-section">
        <div class="settings-section__header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Behavior
        </div>

        <div class="settings-field">
          <div class="settings-field__label">Permission Mode</div>
          <div class="settings-field__hint">How Claude handles tool use for new sessions</div>
          <div class="permission-options" id="permissionOptions">
            <div class="permission-option" data-value="default">
              <div class="permission-option__radio"></div>
              <div class="permission-option__content">
                <div class="permission-option__name">Ask each time</div>
                <div class="permission-option__desc">Confirm before dangerous operations</div>
              </div>
            </div>
            <div class="permission-option" data-value="acceptEdits">
              <div class="permission-option__radio"></div>
              <div class="permission-option__content">
                <div class="permission-option__name">Auto-accept edits</div>
                <div class="permission-option__desc">File edits approved automatically</div>
              </div>
            </div>
            <div class="permission-option permission-option--danger" data-value="bypassPermissions">
              <div class="permission-option__radio"></div>
              <div class="permission-option__content">
                <div class="permission-option__name">Bypass all ⚠</div>
                <div class="permission-option__desc">Skip all permission checks</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trusted Tools -->
      <div class="settings-section">
        <div class="settings-section__header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Trusted Tools
        </div>
        <div class="settings-field">
          <div class="settings-field__hint">These tools skip permission prompts automatically</div>
          <div class="trusted-tools" id="trustedToolsList">
            <span class="trusted-empty">No trusted tools yet</span>
          </div>
        </div>
      </div>

      <!-- MCP Servers -->
      <div class="settings-section">
        <div class="settings-section__header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          MCP Servers
        </div>
        <div class="mcp-list" id="mcpList"></div>
        <button class="mcp-add-btn" id="mcpAddBtn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add MCP Server
        </button>
        <div class="mcp-form" id="mcpForm" style="display:none">
          <input id="mcpName" type="text" placeholder="Server name" />
          <select id="mcpType">
            <option value="stdio">stdio (command)</option>
            <option value="sse">SSE (URL)</option>
            <option value="http">HTTP (URL)</option>
          </select>
          <input id="mcpCommandUrl" type="text" placeholder="Command or URL" />
          <div class="mcp-form-actions">
            <button class="btn-save" id="mcpSaveBtn">Add</button>
            <button class="btn-cancel" id="mcpCancelBtn">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Hooks / Automations -->
      <div class="settings-section">
        <div class="settings-section__header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Automations (Hooks)
        </div>
        <div class="settings-field__hint" style="margin-bottom:6px">Hook events that appear as badges in the chat</div>
        <div class="hook-list" id="hookList"></div>
      </div>

      <!-- About -->
      <div class="settings-section">
        <div class="about-card">
          <div class="about-logo">L</div>
          <div>
            <div class="about-name">Labonair AI Core</div>
            <div class="about-tagline">Zen-mode first editor</div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let sessions = [];
    let renamingId = null;

    // ── Settings state ──
    let currentSettings = {
      defaultModel: 'claude-sonnet-4-6',
      defaultEffort: 'medium',
      permissionMode: 'default',
      trustedTools: [],
      mcpServers: [],
      enabledHooks: [],
    };

    // ── View toggle ──
    const sessionsView = document.getElementById('sessions-view');
    const settingsView = document.getElementById('settings-view');
    const settingsBtn  = document.getElementById('settingsBtn');
    const backBtn      = document.getElementById('backBtn');

    settingsBtn.addEventListener('click', () => {
      sessionsView.style.display = 'none';
      settingsView.classList.add('visible');
      settingsBtn.classList.add('active');
      renderTrustedTools();
      renderMcpList();
      renderHookList();
    });

    backBtn.addEventListener('click', () => {
      settingsView.classList.remove('visible');
      sessionsView.style.display = 'flex';
      settingsBtn.classList.remove('active');
    });

    // ── Incoming messages ──
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'sessions') {
        sessions = msg.payload;
        render();
      } else if (msg.type === 'username') {
        const name = msg.payload || 'Labonair-User';
        document.getElementById('userName').textContent = name;
        document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
      } else if (msg.type === 'settings') {
        currentSettings = { ...currentSettings, ...msg.payload };
        applySettingsToUI();
        renderTrustedTools();
        renderMcpList();
        renderHookList();
      }
    });

    // ── Settings UI ──
    function applySettingsToUI() {
      // Model select
      const modelSel = document.getElementById('defaultModel');
      if (modelSel) { modelSel.value = currentSettings.defaultModel; }

      // Effort pills
      document.querySelectorAll('.effort-pill').forEach(pill => {
        pill.classList.toggle('selected', pill.dataset.value === currentSettings.defaultEffort);
      });

      // Permission options
      document.querySelectorAll('.permission-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === currentSettings.permissionMode);
      });

      // Ensure arrays are initialized
      if (!Array.isArray(currentSettings.trustedTools)) { currentSettings.trustedTools = []; }
      if (!Array.isArray(currentSettings.mcpServers)) { currentSettings.mcpServers = []; }
      if (!Array.isArray(currentSettings.enabledHooks)) { currentSettings.enabledHooks = []; }
    }

    function saveSettings() {
      vscode.postMessage({ type: 'saveSettings', settings: currentSettings });
      const indicator = document.getElementById('saveIndicator');
      indicator.classList.add('show');
      setTimeout(() => { indicator.classList.remove('show'); }, 1600);
    }

    // ── Trusted Tools ──
    function renderTrustedTools() {
      const el = document.getElementById('trustedToolsList');
      if (!el) { return; }
      const tools = currentSettings.trustedTools || [];
      if (tools.length === 0) {
        el.innerHTML = '<span class="trusted-empty">No trusted tools yet</span>';
        return;
      }
      el.innerHTML = tools.map(t => \`
        <div class="trusted-chip">
          <span>\${escHtml(t)}</span>
          <button class="trusted-chip__remove" data-tool="\${escHtml(t)}" title="Remove" aria-label="Remove \${escHtml(t)}">×</button>
        </div>
      \`).join('');
      el.querySelectorAll('.trusted-chip__remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const tool = btn.dataset.tool;
          currentSettings.trustedTools = currentSettings.trustedTools.filter(t => t !== tool);
          saveSettings();
          renderTrustedTools();
        });
      });
    }

    // ── MCP Servers ──
    function renderMcpList() {
      const el = document.getElementById('mcpList');
      if (!el) { return; }
      const servers = currentSettings.mcpServers || [];
      el.innerHTML = servers.map((s, i) => \`
        <div class="mcp-item">
          <span class="mcp-item__name">\${escHtml(s.name)}</span>
          <span class="mcp-item__type">\${escHtml(s.type)}</span>
          <button class="mcp-toggle \${s.enabled ? 'on' : ''}" data-idx="\${i}" title="\${s.enabled ? 'Disable' : 'Enable'}" aria-pressed="\${s.enabled}"></button>
          <button class="mcp-delete" data-idx="\${i}" title="Remove" aria-label="Remove \${escHtml(s.name)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      \`).join('');
      el.querySelectorAll('.mcp-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.idx);
          currentSettings.mcpServers[i].enabled = !currentSettings.mcpServers[i].enabled;
          saveSettings();
          renderMcpList();
        });
      });
      el.querySelectorAll('.mcp-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.idx);
          currentSettings.mcpServers.splice(i, 1);
          saveSettings();
          renderMcpList();
        });
      });
    }

    document.getElementById('mcpAddBtn').addEventListener('click', () => {
      document.getElementById('mcpForm').style.display = 'flex';
      document.getElementById('mcpAddBtn').style.display = 'none';
    });
    document.getElementById('mcpCancelBtn').addEventListener('click', () => {
      document.getElementById('mcpForm').style.display = 'none';
      document.getElementById('mcpAddBtn').style.display = 'flex';
    });
    document.getElementById('mcpSaveBtn').addEventListener('click', () => {
      const name = document.getElementById('mcpName').value.trim();
      const type = document.getElementById('mcpType').value;
      const commandUrl = document.getElementById('mcpCommandUrl').value.trim();
      if (!name || !commandUrl) { return; }
      const entry = { name, type, enabled: true };
      if (type === 'stdio') { entry.command = commandUrl; } else { entry.url = commandUrl; }
      currentSettings.mcpServers = [...(currentSettings.mcpServers || []), entry];
      saveSettings();
      renderMcpList();
      document.getElementById('mcpName').value = '';
      document.getElementById('mcpCommandUrl').value = '';
      document.getElementById('mcpForm').style.display = 'none';
      document.getElementById('mcpAddBtn').style.display = 'flex';
    });

    // ── Hooks ──
    const HOOK_OPTIONS = [
      { value: 'PreToolUse', label: 'Pre-Tool Use', hint: 'Before each tool executes' },
      { value: 'PostToolUse', label: 'Post-Tool Use', hint: 'After each tool completes' },
      { value: 'Notification', label: 'Notification', hint: 'Agent sends a notification' },
      { value: 'Stop', label: 'Stop', hint: 'When the agent finishes a turn' },
    ];

    function renderHookList() {
      const el = document.getElementById('hookList');
      if (!el) { return; }
      el.innerHTML = HOOK_OPTIONS.map(h => \`
        <div class="hook-item">
          <div class="hook-item__label">
            \${escHtml(h.label)}
            <div class="hook-item__hint">\${escHtml(h.hint)}</div>
          </div>
          <button class="mcp-toggle \${(currentSettings.enabledHooks || []).includes(h.value) ? 'on' : ''}" data-hook="\${h.value}" title="Toggle \${escHtml(h.label)}" aria-pressed="\${(currentSettings.enabledHooks || []).includes(h.value)}"></button>
        </div>
      \`).join('');
      el.querySelectorAll('.mcp-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const hook = btn.dataset.hook;
          const hooks = currentSettings.enabledHooks || [];
          if (hooks.includes(hook)) {
            currentSettings.enabledHooks = hooks.filter(h => h !== hook);
          } else {
            currentSettings.enabledHooks = [...hooks, hook];
          }
          saveSettings();
          renderHookList();
        });
      });
    }

    // Model select
    document.getElementById('defaultModel').addEventListener('change', e => {
      currentSettings.defaultModel = e.target.value;
      saveSettings();
    });

    // Effort pills
    document.getElementById('effortPills').addEventListener('click', e => {
      const pill = e.target.closest('.effort-pill');
      if (!pill) { return; }
      currentSettings.defaultEffort = pill.dataset.value;
      applySettingsToUI();
      saveSettings();
    });

    // Permission options
    document.getElementById('permissionOptions').addEventListener('click', e => {
      const opt = e.target.closest('.permission-option');
      if (!opt) { return; }
      currentSettings.permissionMode = opt.dataset.value;
      applySettingsToUI();
      saveSettings();
    });

    // ── New session button ──
    document.getElementById('newBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'newSession' });
    });

    // ── Search ──
    document.getElementById('searchInput').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.session').forEach(el => {
        const label = el.querySelector('.session__label');
        const text = label ? label.textContent.toLowerCase() : '';
        el.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });

    // ── Sessions render ──
    function statusLabel(s) {
      if (s === 'permission_required') { return 'waiting'; }
      return s;
    }

    function sessionCard(s, isChild) {
      const indent = isChild ? 'style="margin-left:14px;border-left:2px solid var(--vscode-widget-border,rgba(255,255,255,0.1));padding-left:6px;"' : '';
      const childPrefix = isChild ? '↳ ' : '';
      if (s.id === renamingId) {
        return \`<div class="session" data-id="\${s.id}" \${indent}>
          <span class="session__dot session__dot--\${s.status}"></span>
          <input class="session__rename" id="rename-\${s.id}" value="\${escHtml(s.label)}" />
        </div>\`;
      }
      return \`<div class="session" data-id="\${s.id}" \${indent}>
        <span class="session__dot session__dot--\${s.status}"></span>
        <div class="session__info">
          <div class="session__label">\${childPrefix}\${escHtml(s.label)}</div>
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
    }

    function render() {
      const list = document.getElementById('list');
      if (!sessions.length) {
        list.innerHTML = '<p class="empty">No sessions yet.<br/>Click + to start one.</p>';
        return;
      }

      // Build tree: root sessions first, then children inline
      const children = {};
      sessions.forEach(s => { if (s.parentId) { (children[s.parentId] = children[s.parentId] || []).push(s); } });
      const roots = sessions.filter(s => !s.parentId);
      const ordered = [];
      roots.forEach(r => {
        ordered.push({ s: r, isChild: false });
        (children[r.id] || []).forEach(c => ordered.push({ s: c, isChild: true }));
      });

      list.innerHTML = ordered.map(({ s, isChild }) => sessionCard(s, isChild)).join('');

      // Wire events
      list.querySelectorAll('.session').forEach(el => {
        const id = el.dataset.id;
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
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
