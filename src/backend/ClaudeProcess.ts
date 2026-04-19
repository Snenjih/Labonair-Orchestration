import * as vscode from 'vscode';
import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
  type PermissionResult,
  type PermissionMode,
  type EffortLevel,
  type SlashCommand,
} from '@anthropic-ai/claude-agent-sdk';
import * as crypto from 'crypto';

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

type AsyncInput<T> = { push: (item: T) => void; end: () => void; iterable: AsyncIterable<T> };

function createAsyncInput<T>(): AsyncInput<T> {
  const queue: T[] = [];
  const resolvers: Array<(r: IteratorResult<T, void>) => void> = [];
  let closed = false;
  return {
    push(item) {
      if (closed) { return; }
      const res = resolvers.shift();
      if (res) { res({ value: item, done: false }); return; }
      queue.push(item);
    },
    end() {
      closed = true;
      while (resolvers.length) { resolvers.shift()!({ value: undefined, done: true }); }
    },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T, void>> {
            if (queue.length) { return Promise.resolve({ value: queue.shift()!, done: false }); }
            if (closed) { return Promise.resolve({ value: undefined, done: true }); }
            return new Promise(resolve => resolvers.push(resolve));
          }
        };
      }
    }
  };
}

export class ClaudeProcess {
  private cwd: string;
  private model: string;
  private permissionMode: PermissionMode;
  private effort: EffortLevel | undefined;
  private apiKey: string | undefined;
  private trustedTools: string[];
  private activeQuery: Query | null = null;
  private inputStream: AsyncInput<SDKUserMessage> | null = null;
  private pendingPermissions = new Map<string, (result: PermissionResult) => void>();

  private _onRawOutput = new vscode.EventEmitter<string>();
  public readonly onRawOutput = this._onRawOutput.event;

  private _onPermissionRequest = new vscode.EventEmitter<{ requestId: string; toolName: string; input: unknown }>();
  public readonly onPermissionRequest = this._onPermissionRequest.event;

  private _onHookEvent = new vscode.EventEmitter<{ hookType: string; message: string }>();
  public readonly onHookEvent = this._onHookEvent.event;

  constructor(cwd: string, model = 'claude-sonnet-4-6', permissionMode: PermissionMode = 'default', effort?: EffortLevel, apiKey?: string, trustedTools: string[] = []) {
    this.cwd = cwd;
    this.model = model;
    this.permissionMode = permissionMode;
    this.effort = effort;
    this.apiKey = apiKey;
    this.trustedTools = trustedTools;
  }

  setTrustedTools(tools: string[]): void { this.trustedTools = tools; }

  private _ensureQuery(): void {
    if (this.activeQuery && this.inputStream) { return; }
    this.inputStream = createAsyncInput<SDKUserMessage>();
    this.activeQuery = query({
      prompt: this.inputStream.iterable,
      options: {
        cwd: this.cwd,
        model: this.model,
        permissionMode: this.permissionMode,
        settingSources: ['user', 'project'],
        ...(this.effort ? { effort: this.effort } : {}),
        ...(this.apiKey ? { env: { ANTHROPIC_API_KEY: this.apiKey } } : {}),
        canUseTool: async (toolName: string, input: unknown) => {
          if (this.trustedTools.includes(toolName)) {
            return { behavior: 'allow', updatedInput: {}, updatedPermissions: [] };
          }
          const requestId = `perm-${crypto.randomUUID()}`;
          return new Promise<PermissionResult>(resolve => {
            this.pendingPermissions.set(requestId, resolve);
            this._onPermissionRequest.fire({ requestId, toolName, input });
          });
        },
        stderr: (data: string) => {
          this._onRawOutput.fire(data);
        },
      },
    });
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    this._ensureQuery();
    return this.activeQuery!.supportedCommands();
  }

  async *startTurn(text: string, imageBlocks: ImageBlock[] = []): AsyncGenerator<SDKMessage> {
    this._ensureQuery();

    const content: unknown = imageBlocks.length > 0
      ? [...imageBlocks, { type: 'text', text }]
      : text;

    this.inputStream!.push({
      type: 'user',
      message: { role: 'user', content } as any,
      parent_tool_use_id: null,
    });

    for await (const message of this.activeQuery!) {
      yield message;
      if (message.type === 'result') { break; }
    }
  }

  respondToPermission(requestId: string, allowed: boolean): void {
    const resolve = this.pendingPermissions.get(requestId);
    if (!resolve) { return; }
    this.pendingPermissions.delete(requestId);
    resolve(allowed
      ? { behavior: 'allow', updatedInput: {}, updatedPermissions: [] }
      : { behavior: 'deny', message: 'Permission denied by user' }
    );
  }

  setModel(model: string): void { this.model = model; }
  setEffort(effort: EffortLevel): void { this.effort = effort; }
  setApiKey(key: string): void { this.apiKey = key; }
  clearApiKey(): void { this.apiKey = undefined; }
  setPermissionMode(mode: PermissionMode): void { this.permissionMode = mode; }

  async setFastMode(enabled: boolean): Promise<void> {
    if (!this.activeQuery) { return; }
    await this.activeQuery.setModel(enabled ? 'claude-haiku-4-5-20251001' : this.model);
  }

  async applyMcpServers(servers: import('../shared/types').McpServerEntry[]): Promise<void> {
    if (!this.activeQuery) { return; }
    const enabled = servers.filter(s => s.enabled);
    const mcpRecord: Record<string, import('@anthropic-ai/claude-agent-sdk').McpServerConfig> = {};
    for (const s of enabled) {
      if (s.type === 'stdio' && s.command) {
        mcpRecord[s.name] = { type: 'stdio', command: s.command };
      } else if (s.type === 'sse' && s.url) {
        mcpRecord[s.name] = { type: 'sse', url: s.url };
      } else if (s.type === 'http' && s.url) {
        mcpRecord[s.name] = { type: 'http', url: s.url };
      }
    }
    await this.activeQuery.setMcpServers(mcpRecord);
  }

  async interrupt(): Promise<void> {
    if (this.activeQuery) {
      await this.activeQuery.interrupt();
    }
  }

  dispose(): void {
    this.inputStream?.end();
    this.activeQuery = null;
    this.inputStream = null;
    this._onRawOutput.dispose();
    this._onPermissionRequest.dispose();
    this._onHookEvent.dispose();
  }
}
