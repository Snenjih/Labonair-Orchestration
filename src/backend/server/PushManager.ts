import * as vscode from 'vscode';

const VAPID_KEY = 'labonair.bridge.vapid';

interface VapidKeys { publicKey: string; privateKey: string; }

export class PushManager {
  private vapidPublicKey = '';
  private webPush: typeof import('web-push') | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async init(): Promise<void> {
    try {
      // Dynamic import — web-push is optional; fail gracefully if absent
      this.webPush = require('web-push') as typeof import('web-push');
    } catch {
      return;
    }

    const stored = await this.context.secrets.get(VAPID_KEY);
    let keys: VapidKeys;
    if (stored) {
      keys = JSON.parse(stored) as VapidKeys;
    } else {
      keys = this.webPush.generateVAPIDKeys();
      await this.context.secrets.store(VAPID_KEY, JSON.stringify(keys));
    }
    this.vapidPublicKey = keys.publicKey;
    this.webPush.setVapidDetails('mailto:bridge@labonair.local', keys.publicKey, keys.privateKey);
  }

  getPublicKey(): string {
    return this.vapidPublicKey;
  }

  async sendPush(subscriptionJson: string, payload: object): Promise<boolean> {
    if (!this.webPush || !subscriptionJson) { return false; }
    try {
      const sub = JSON.parse(subscriptionJson) as import('web-push').PushSubscription;
      await this.webPush.sendNotification(sub, JSON.stringify(payload));
      return true;
    } catch (err: unknown) {
      const code = (err as { statusCode?: number }).statusCode;
      return code !== 410; // false = subscription expired, caller should clear it
    }
  }
}
