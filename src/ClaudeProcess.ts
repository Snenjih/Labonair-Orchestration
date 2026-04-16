import * as pty from 'node-pty';
import * as os from 'os';
import * as vscode from 'vscode';
import { PtyParser } from './parser/PtyParser';

export class ClaudeProcess {
  private ptyProcess: pty.IPty;
  private currentModel: string = '';

  private _onData = new vscode.EventEmitter<string>();
  public readonly onData = this._onData.event;

  public readonly parser = new PtyParser();

  constructor(cwd: string) {
    const shell = os.platform() === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'bash');
    const args = os.platform() === 'win32' ? ['/c', 'claude'] : ['-c', 'claude'];

    this.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      this._onData.fire(data);
      this.parser.append(data);
    });
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  /**
   * Switch the active model mid-session using Claude Code's /model slash-command.
   * Only sends the command if the model actually changed.
   */
  setModel(model: string): void {
    if (model && model !== this.currentModel) {
      this.currentModel = model;
      this.ptyProcess.write(`/model ${model}\r`);
    }
  }

  public respondToPermission(allowed: boolean): void {
    this.ptyProcess.write(allowed ? 'y\r' : 'n\r');
    this.parser.resolvePermission();
  }

  dispose(): void {
    this.ptyProcess.kill();
    this._onData.dispose();
    this.parser.dispose();
  }
}
