export interface WsMsg { type: string; [key: string]: unknown; }
type Handler = (msg: WsMsg) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = 1000;
  private _isAuthenticated = false;
  private _isReadOnly = false;
  private _permanentlyFailed = false;
  private _stopped = false;
  private deviceId: string | null;
  private readonly wsUrl: string;

  constructor(
    host: string,
    private readonly token: string,
  ) {
    this.wsUrl = `ws://${host}`;
    this.deviceId = localStorage.getItem('labonair.bridge.deviceId');
  }

  get isAuthenticated(): boolean { return this._isAuthenticated; }
  get isReadOnly(): boolean { return this._isReadOnly; }

  connect(): void {
    if (this._stopped || this._permanentlyFailed) { return; }
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => this._onOpen();
      this.ws.onmessage = (e) => this._onMessage(e);
      this.ws.onclose = () => this._onClose();
      this.ws.onerror = () => { this.ws?.close(); };
    } catch {
      this._scheduleReconnect();
    }
  }

  send(msg: WsMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: Handler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      this.handlers.set(type, (this.handlers.get(type) ?? []).filter(h => h !== handler));
    };
  }

  disconnect(): void {
    this._stopped = true;
    this._clearPing();
    this.ws?.close(1000, 'User closed');
  }

  private _onOpen(): void {
    this.reconnectDelay = 1000;
    const authMsg: WsMsg = { type: 'authenticate', token: this.token, deviceName: navigator.userAgent };
    if (this.deviceId) { authMsg.deviceId = this.deviceId; }
    this.send(authMsg);
  }

  private _onMessage(e: MessageEvent): void {
    try {
      const msg = JSON.parse(e.data as string) as WsMsg;

      if (msg.type === 'auth_success') {
        this._isAuthenticated = true;
        this._isReadOnly = msg.readOnly as boolean;
        const id = msg.deviceId as string;
        this.deviceId = id;
        localStorage.setItem('labonair.bridge.deviceId', id);
        this._startPing();
      }

      if (msg.type === 'auth_failed') {
        // Don't reconnect on permanent auth failure (invalid token)
        this._permanentlyFailed = true;
      }

      (this.handlers.get(msg.type) ?? []).forEach(h => h(msg));
      (this.handlers.get('*') ?? []).forEach(h => h(msg));
    } catch { /* ignore parse errors */ }
  }

  private _onClose(): void {
    this._isAuthenticated = false;
    this._clearPing();
    (this.handlers.get('disconnected') ?? []).forEach(h => h({ type: 'disconnected' }));
    // Only reconnect for transient disconnects, not permanent failures or intentional stops
    if (!this._permanentlyFailed && !this._stopped) {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  private _startPing(): void {
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 20_000);
  }

  private _clearPing(): void {
    if (this.pingTimer !== null) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}
