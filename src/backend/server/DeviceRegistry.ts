import * as vscode from 'vscode';
import type { WebSocket } from 'ws';
import type { ConnectedDevice } from '../../shared/types';

const STORAGE_KEY = 'labonair.bridge.devices';

export class DeviceRegistry {
  private devices = new Map<string, ConnectedDevice>();
  private sockets = new Map<string, WebSocket>();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Restore push subscriptions from previous sessions
    const stored = context.globalState.get<ConnectedDevice[]>(STORAGE_KEY, []);
    for (const d of stored) {
      if (d.pushSubscription) {
        this.devices.set(d.id, { ...d, connectedAt: 0, lastActivity: 0 });
      }
    }
  }

  register(device: ConnectedDevice, ws: WebSocket): void {
    this.devices.set(device.id, device);
    this.sockets.set(device.id, ws);
    this._persist();
  }

  get(deviceId: string): ConnectedDevice | undefined {
    return this.devices.get(deviceId);
  }

  getSocket(deviceId: string): WebSocket | undefined {
    return this.sockets.get(deviceId);
  }

  getConnected(): ConnectedDevice[] {
    return Array.from(this.devices.values()).filter(d => this.sockets.has(d.id));
  }

  getAll(): ConnectedDevice[] {
    return Array.from(this.devices.values());
  }

  disconnect(deviceId: string): void {
    const ws = this.sockets.get(deviceId);
    if (ws) {
      try { ws.close(1000, 'Disconnected by server'); } catch { /* ignore */ }
      this.sockets.delete(deviceId);
    }
  }

  disconnectAll(): void {
    for (const id of [...this.sockets.keys()]) {
      this.disconnect(id);
    }
  }

  onDisconnect(deviceId: string): void {
    this.sockets.delete(deviceId);
  }

  updateLastActivity(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (d) { d.lastActivity = Date.now(); }
  }

  updatePushSubscription(deviceId: string, subscription: string): void {
    const d = this.devices.get(deviceId);
    if (d) {
      d.pushSubscription = subscription || undefined;
      this._persist();
    }
  }

  setReadOnly(deviceId: string, readOnly: boolean): void {
    const d = this.devices.get(deviceId);
    if (d) {
      d.isReadOnly = readOnly;
      this._persist();
    }
  }

  startCleanup(timeoutMinutes: number): void {
    this.stopCleanup();
    if (timeoutMinutes === 0) { return; }
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - timeoutMinutes * 60_000;
      for (const [id, d] of this.devices) {
        if (this.sockets.has(id) && d.lastActivity > 0 && d.lastActivity < cutoff) {
          this.disconnect(id);
        }
      }
    }, 60_000);
  }

  stopCleanup(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private _persist(): void {
    const toStore = this.getAll().map(d => ({ ...d, connectedAt: 0, lastActivity: 0 }));
    this.context.globalState.update(STORAGE_KEY, toStore);
  }
}
