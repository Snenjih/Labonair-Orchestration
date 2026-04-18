import * as vscode from 'vscode';
import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
  type PermissionResult,
  type PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import * as crypto from 'crypto';

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
  private activeQuery: Query | null = null;
  private inputStream: AsyncInput<SDKUserMessage> | null = null;
  private pendingPermissions = new Map<string, (result: PermissionResult) => void>();

  private _onRawOutput = new vscode.EventEmitter<string>();
  public readonly onRawOutput = this._onRawOutput.event;

  private _onPermissionRequest = new vscode.EventEmitter<{ requestId: string; toolName: string; input: unknown }>();
  public readonly onPermissionRequest = this._onPermissionRequest.event;

  constructor(cwd: string, model = 'claude-opus-4-7', permissionMode: PermissionMode = 'default') {
    this.cwd = cwd;
    this.model = model;
    this.permissionMode = permissionMode;
  }

  async *startTurn(text: string): AsyncGenerator<SDKMessage> {
    if (!this.activeQuery || !this.inputStream) {
      this.inputStream = createAsyncInput<SDKUserMessage>();
      this.activeQuery = query({
        prompt: this.inputStream.iterable,
        options: {
          cwd: this.cwd,
          model: this.model,
          permissionMode: this.permissionMode,
          settingSources: ['user', 'project'],
          canUseTool: async (toolName: string, input: unknown) => {
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

    this.inputStream.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    });

    for await (const message of this.activeQuery) {
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
  setPermissionMode(mode: PermissionMode): void { this.permissionMode = mode; }

  interrupt(): void {
    (this.activeQuery as any)?.abort?.();
  }

  dispose(): void {
    this.inputStream?.end();
    this.activeQuery = null;
    this.inputStream = null;
    this._onRawOutput.dispose();
    this._onPermissionRequest.dispose();
  }
}
