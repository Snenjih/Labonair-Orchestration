import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import type { BridgeSettings, ConnectedDevice, ParsedEvent } from '../../shared/types';
import type { SessionManager } from '../SessionManager';
import { DeviceRegistry } from './DeviceRegistry';
import { RateLimiter } from './RateLimiter';
import { PushManager } from './PushManager';

const TOKEN_KEY = 'labonair.bridge.token';

interface WsMsg { type: string; [key: string]: unknown; }
type SubscriptionMap = Map<string, Set<string>>;

export class BridgeServer {
  private httpServer: http.Server | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wss: any; // ws.WebSocketServer — typed loosely to avoid import issues
  private registry: DeviceRegistry;
  private rateLimiter = new RateLimiter();
  private pushManager: PushManager;
  private subscriptions: SubscriptionMap = new Map();
  private boundPort = 0;
  private boundIp = '';
  private _isRunning = false;
  private outputChannel: vscode.OutputChannel;
  private settings: BridgeSettings;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sessionManager: SessionManager,
    settings: BridgeSettings,
  ) {
    this.settings = { ...settings };
    this.registry = new DeviceRegistry(context);
    this.pushManager = new PushManager(context);
    this.outputChannel = vscode.window.createOutputChannel('Labonair Bridge');
  }

  get isRunning(): boolean { return this._isRunning; }

  async start(): Promise<void> {
    if (this._isRunning) { await this.stop(); }

    let ws: typeof import('ws');
    let express: typeof import('express');
    try {
      ws = require('ws');
      express = require('express');
    } catch {
      vscode.window.showErrorMessage('Labonair Bridge: required packages (ws, express) not installed. Run npm install.');
      return;
    }

    await this.pushManager.init();
    await this._ensureToken();

    const ip = this._getLanIp();
    const port = await this._findOpenPort(this.settings.port);
    this.boundIp = ip;
    this.boundPort = port;

    const app = express();
    const staticPath = path.join(this.context.extensionPath, 'dist', 'mobile');

    app.use(express.static(staticPath));
    app.get('*', (_req: import('express').Request, res: import('express').Response) => {
      res.sendFile(path.join(staticPath, 'index.html'), (err) => {
        if (err) { res.status(404).end(); }
      });
    });

    this.httpServer = http.createServer(app);
    this.wss = new ws.WebSocketServer({ server: this.httpServer });
    this.wss.on('connection', (socket: import('ws').WebSocket, req: http.IncomingMessage) =>
      this._handleConnection(socket, req));

    this.disposables.push(
      this.sessionManager.onParsedEvent(({ id, event }) => this._broadcastEvent(id, event)),
      this.sessionManager.onDidChangeSessions(() => this._broadcastSessionList()),
    );

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(port, ip, () => resolve());
      this.httpServer!.on('error', reject);
    });

    this.registry.startCleanup(this.settings.connectionTimeoutMinutes);
    this._isRunning = true;
    this._log(`Started on http://${ip}:${port}`);
    vscode.window.showInformationMessage(`Labonair Bridge active on port ${port}`);
  }

  async stop(): Promise<void> {
    this.registry.disconnectAll();
    this.registry.stopCleanup();
    this.subscriptions.clear();
    this.rateLimiter.clear();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];

    await new Promise<void>(resolve => {
      if (this.wss) { this.wss.close(() => resolve()); } else { resolve(); }
    });
    await new Promise<void>(resolve => {
      if (this.httpServer) { this.httpServer.close(() => resolve()); } else { resolve(); }
    });

    this.wss = undefined;
    this.httpServer = undefined;
    this._isRunning = false;
    this._log('Stopped');
  }

  async rotateToken(): Promise<void> {
    await this.context.secrets.store(TOKEN_KEY, crypto.randomUUID());
    this.registry.disconnectAll();
    this.subscriptions.clear();
    this._log('Token rotated — all devices disconnected');
  }

  async getQrData(): Promise<{ url: string; svg: string }> {
    const token = await this.context.secrets.get(TOKEN_KEY) ?? '';
    const url = `http://${this.boundIp}:${this.boundPort}?t=${token}`;
    return { url, svg: this._generateQrSvg(url) };
  }

  getState(): { isRunning: boolean; port: number; ip: string; devices: ConnectedDevice[] } {
    return {
      isRunning: this._isRunning,
      port: this.boundPort,
      ip: this.boundIp,
      devices: this.registry.getConnected(),
    };
  }

  disconnectDevice(deviceId: string): void {
    this.registry.disconnect(deviceId);
    this.subscriptions.delete(deviceId);
    this.rateLimiter.reset(deviceId);
  }

  setDeviceReadOnly(deviceId: string, readOnly: boolean): void {
    this.registry.setReadOnly(deviceId, readOnly);
  }

  async updateSettings(settings: BridgeSettings): Promise<void> {
    const portChanged = settings.port !== this.settings.port;
    this.settings = { ...settings };
    if (portChanged && this._isRunning) { await this.start(); }
  }

  private async _handleConnection(ws: import('ws').WebSocket, req: http.IncomingMessage): Promise<void> {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const ua = req.headers['user-agent'] ?? '';
    const deviceName = this._parseDeviceName(ua);

    if (this.registry.getConnected().length >= this.settings.maxConnections) {
      ws.send(JSON.stringify({ type: 'auth_failed', reason: 'Max connections reached' }));
      ws.close();
      return;
    }

    let authenticatedId: string | undefined;

    ws.on('message', async (data: Buffer) => {
      let msg: WsMsg;
      try { msg = JSON.parse(data.toString()) as WsMsg; } catch { ws.close(); return; }

      if (!authenticatedId) {
        if (msg.type !== 'authenticate') {
          ws.send(JSON.stringify({ type: 'auth_failed', reason: 'Send authenticate first' }));
          ws.close();
          return;
        }
        authenticatedId = await this._authenticate(msg, ip, deviceName, ws) ?? undefined;
        return;
      }

      if (!this.rateLimiter.check(authenticatedId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
        ws.close();
        return;
      }

      this.registry.updateLastActivity(authenticatedId);
      await this._route(msg, authenticatedId, ws);
    });

    ws.on('close', () => {
      if (authenticatedId) {
        this.registry.onDisconnect(authenticatedId);
        this.subscriptions.delete(authenticatedId);
        this.rateLimiter.reset(authenticatedId);
      }
    });

    ws.on('error', () => ws.close());
  }

  private async _authenticate(
    msg: WsMsg, ip: string, deviceName: string, ws: import('ws').WebSocket,
  ): Promise<string | null> {
    const token = msg.token as string | undefined;
    const incomingId = msg.deviceId as string | undefined;
    const storedToken = await this.context.secrets.get(TOKEN_KEY);

    if (!token || token !== storedToken) {
      ws.send(JSON.stringify({ type: 'auth_failed', reason: 'Invalid token' }));
      ws.close();
      return null;
    }

    const deviceId = (incomingId && this.registry.get(incomingId))
      ? incomingId
      : crypto.randomUUID();

    if (this.settings.allowedDeviceIds.length > 0 &&
        !this.settings.allowedDeviceIds.includes(deviceId)) {
      ws.send(JSON.stringify({ type: 'auth_failed', reason: 'Device not in allow list' }));
      ws.close();
      return null;
    }

    const existing = this.registry.get(deviceId);
    const isReadOnly = this.settings.readOnlyMode || (existing?.isReadOnly ?? false);

    const device: ConnectedDevice = {
      id: deviceId,
      name: deviceName,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      ip,
      isReadOnly,
      pushSubscription: existing?.pushSubscription,
    };

    this.registry.register(device, ws);
    ws.send(JSON.stringify({
      type: 'auth_success',
      deviceId,
      readOnly: isReadOnly,
      serverVersion: '1.0',
      vapidPublicKey: this.pushManager.getPublicKey(),
    }));

    if (this.settings.auditLogEnabled) {
      this._log(`AUDIT connect deviceId=${deviceId} ip=${ip} name=${deviceName}`);
    }

    return deviceId;
  }

  private async _route(msg: WsMsg, deviceId: string, ws: import('ws').WebSocket): Promise<void> {
    const device = this.registry.get(deviceId);
    const isReadOnly = device?.isReadOnly ?? false;

    const rejectReadOnly = () => ws.send(JSON.stringify({ type: 'error', message: 'Read-only mode' }));

    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'get_sessions': {
        const sessions = this.sessionManager.getAllSessions().map(({ id, state }) => ({
          id, label: state.label, status: state.status, parentId: state.parentId,
        }));
        ws.send(JSON.stringify({ type: 'sessions', sessions }));
        break;
      }

      case 'subscribe_session': {
        const sid = msg.sessionId as string;
        if (!sid) { break; }
        if (!this.subscriptions.has(deviceId)) { this.subscriptions.set(deviceId, new Set()); }
        this.subscriptions.get(deviceId)!.add(sid);
        const state = this.sessionManager.getSessionState(sid);
        if (state) {
          ws.send(JSON.stringify({
            type: 'session_history',
            sessionId: sid,
            history: state.history,
            status: state.status,
            label: state.label,
          }));
        }
        break;
      }

      case 'unsubscribe_session':
        this.subscriptions.get(deviceId)?.delete(msg.sessionId as string);
        break;

      case 'send_message': {
        if (isReadOnly) { rejectReadOnly(); return; }
        const { sessionId, text } = msg as { sessionId: string; text: string; type: string };
        if (sessionId && text) {
          this.sessionManager.runTurn(sessionId, text).catch(() => {});
          if (this.settings.auditLogEnabled) {
            this._log(`AUDIT send_message deviceId=${deviceId} sessionId=${sessionId}`);
          }
        }
        break;
      }

      case 'respond_permission': {
        if (isReadOnly) { rejectReadOnly(); return; }
        const { sessionId, requestId, allowed } = msg as { sessionId: string; requestId: string; allowed: boolean; type: string };
        this.sessionManager.respondToPermission(sessionId, requestId, allowed);
        if (this.settings.auditLogEnabled) {
          this._log(`AUDIT respond_permission deviceId=${deviceId} allowed=${allowed}`);
        }
        break;
      }

      case 'interrupt_session': {
        if (isReadOnly) { rejectReadOnly(); return; }
        const sid = msg.sessionId as string;
        if (sid) { this.sessionManager.interruptSession(sid).catch(() => {}); }
        break;
      }

      case 'register_push': {
        const sub = msg.subscription;
        if (sub) {
          this.registry.updatePushSubscription(deviceId, JSON.stringify(sub));
        }
        break;
      }
    }
  }

  private _broadcastEvent(sessionId: string, event: ParsedEvent): void {
    for (const [deviceId, subs] of this.subscriptions) {
      if (!subs.has(sessionId)) { continue; }
      const ws = this.registry.getSocket(deviceId);
      if (ws?.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify({ type: 'session_event', sessionId, event }));
      }
    }

    if (event.type === 'permission_request' && this.settings.pushNotificationsEnabled) {
      this._sendPermissionPush(sessionId, event);
    }
  }

  private _broadcastSessionList(): void {
    const sessions = this.sessionManager.getAllSessions().map(({ id, state }) => ({
      id, label: state.label, status: state.status, parentId: state.parentId,
    }));
    const payload = JSON.stringify({ type: 'sessions', sessions });
    for (const device of this.registry.getConnected()) {
      const ws = this.registry.getSocket(device.id);
      if (ws?.readyState === 1) { ws.send(payload); }
    }
  }

  private _sendPermissionPush(sessionId: string, event: ParsedEvent & { type: 'permission_request' }): void {
    for (const device of this.registry.getAll()) {
      if (!device.pushSubscription) { continue; }
      const payload = {
        title: 'Claude needs permission',
        body: event.action,
        data: { sessionId, requestId: event.requestId },
      };
      this.pushManager.sendPush(device.pushSubscription, payload).then(ok => {
        if (!ok) { this.registry.updatePushSubscription(device.id, ''); }
      });
    }
  }

  private _getLanIp(): string {
    for (const iface of Object.values(os.networkInterfaces())) {
      for (const entry of iface ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) { return entry.address; }
      }
    }
    return '127.0.0.1';
  }

  private async _findOpenPort(start: number): Promise<number> {
    for (let p = start; p < start + 10; p++) {
      if (await this._isPortFree(p)) { return p; }
    }
    return start;
  }

  private _isPortFree(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const srv = http.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '0.0.0.0');
    });
  }

  private async _ensureToken(): Promise<void> {
    if (!await this.context.secrets.get(TOKEN_KEY)) {
      await this.context.secrets.store(TOKEN_KEY, crypto.randomUUID());
    }
  }

  private _parseDeviceName(ua: string): string {
    if (ua.includes('iPhone')) { return 'iPhone'; }
    if (ua.includes('iPad')) { return 'iPad'; }
    if (ua.includes('Android')) { return 'Android'; }
    if (ua.includes('Mac')) { return 'Mac'; }
    if (ua.includes('Windows')) { return 'Windows'; }
    return 'Device';
  }

  private _generateQrSvg(url: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const QRCode = require('qrcode-svg');
      return new QRCode({
        content: url, padding: 2, width: 180, height: 180,
        color: '#e0e0ff', background: '#1a1a2e', ecl: 'M',
      }).svg() as string;
    } catch {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">` +
        `<rect width="180" height="180" fill="#1a1a2e"/>` +
        `<text x="90" y="88" fill="#e0e0ff" text-anchor="middle" font-size="11" font-family="monospace">Install qrcode-svg</text>` +
        `<text x="90" y="104" fill="#e0e0ff" text-anchor="middle" font-size="11" font-family="monospace">npm install</text></svg>`;
    }
  }

  private _log(msg: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  dispose(): void {
    this.stop();
    this.outputChannel.dispose();
  }
}
