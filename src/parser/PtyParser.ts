import * as vscode from 'vscode';
import { ParsedEvent } from '../shared/types';
import { stripAnsi } from './ansi-utils';

// Claude Code's interactive prompt line after a completed turn.
// Matches lines like "❯ " or "> " that appear when the CLI is idle again.
const PROMPT_RE = /(?:^|\n)[❯>$]\s*$/;

export class PtyParser {
  private buffer: string = '';
  private isAwaitingPermission: boolean = false;
  private hasEmittedMessage: boolean = false;

  private _onParsedEvent = new vscode.EventEmitter<ParsedEvent>();
  public readonly onParsedEvent = this._onParsedEvent.event;

  append(chunk: string): void {
    this.buffer += chunk;
    this.flush();
  }

  public resolvePermission(): void {
    this.isAwaitingPermission = false;
  }

  private flush(): void {
    const clean = stripAnsi(this.buffer);

    // Permission prompt: any line ending with [y/N] or [Y/n]
    const permMatch = clean.match(/([\s\S]*?)\s*\[y\/[Nn]\]\s*$/i);
    if (permMatch && !this.isAwaitingPermission) {
      this.isAwaitingPermission = true;
      const context = permMatch[1].trim();
      this._onParsedEvent.fire({ type: 'permission_request', action: 'shell', context });
      this.buffer = '';
      return;
    }

    if (this.isAwaitingPermission) { return; }

    // Session finished: CLI returned to its idle prompt after emitting content
    if (this.hasEmittedMessage && PROMPT_RE.test(clean)) {
      // Flush any remaining text before the prompt as a final message
      const beforePrompt = clean.replace(PROMPT_RE, '').trim();
      if (beforePrompt) {
        this._onParsedEvent.fire({ type: 'agent_message', text: beforePrompt });
      }
      this._onParsedEvent.fire({ type: 'session_finished' });
      this.buffer = '';
      this.hasEmittedMessage = false;
      return;
    }

    // Thought: "Thinking..."
    const thinkMatch = clean.match(/Thinking\.\.\.\n/);
    if (thinkMatch) {
      this._onParsedEvent.fire({ type: 'thought', status: 'loading', text: 'Thinking...' });
      this.hasEmittedMessage = true;
      this.consume(thinkMatch[0]);
      return this.flush();
    }

    // Tool call start: "Running tool: <name>[ args]"
    const toolStartMatch = clean.match(/Running tool:\s*(\S+)([^\n]*)\n/);
    if (toolStartMatch) {
      const args = toolStartMatch[2].trim();
      this._onParsedEvent.fire({ type: 'tool_call_start', toolName: toolStartMatch[1], ...(args ? { args } : {}) });
      this.hasEmittedMessage = true;
      this.consume(toolStartMatch[0]);
      return this.flush();
    }

    // Tool output: "Tool output:\n<text>\n\n"
    const toolOutMatch = clean.match(/Tool output:\s*\n([\s\S]*?\n)\n/);
    if (toolOutMatch) {
      this._onParsedEvent.fire({ type: 'tool_call_output', output: toolOutMatch[1].trim() });
      this.consume(toolOutMatch[0]);
      return this.flush();
    }

    // Tool end: "Tool completed" / "Tool failed"
    const toolEndMatch = clean.match(/Tool (completed|failed)\n/i);
    if (toolEndMatch) {
      this._onParsedEvent.fire({ type: 'tool_call_end', status: toolEndMatch[1].toLowerCase() as 'completed' | 'failed' });
      this.consume(toolEndMatch[0]);
      return this.flush();
    }

    // Flush complete lines as agent messages
    const newline = clean.lastIndexOf('\n');
    if (newline !== -1) {
      const text = clean.slice(0, newline + 1);
      if (text.trim()) {
        this._onParsedEvent.fire({ type: 'agent_message', text: text.trimEnd() });
        this.hasEmittedMessage = true;
      }
      // Advance raw buffer past the consumed clean text
      this.buffer = this.advanceBuffer(this.buffer, newline + 1);
    }
  }

  /**
   * Advance `raw` by exactly `cleanChars` visible characters,
   * skipping ANSI escape sequences (which have zero visible width).
   */
  private advanceBuffer(raw: string, cleanChars: number): string {
    let cleanCount = 0;
    let rawIdx = 0;
    while (rawIdx < raw.length && cleanCount < cleanChars) {
      const ansiMatch = raw.slice(rawIdx).match(/^[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/);
      if (ansiMatch) {
        rawIdx += ansiMatch[0].length;
      } else {
        cleanCount++;
        rawIdx++;
      }
    }
    return raw.slice(rawIdx);
  }

  /** Consume `matchedCleanText` from the raw buffer. */
  private consume(matchedCleanText: string): void {
    const idx = stripAnsi(this.buffer).indexOf(matchedCleanText);
    if (idx === -1) { return; }
    this.buffer = this.advanceBuffer(this.buffer, idx + matchedCleanText.length);
  }

  dispose(): void {
    this._onParsedEvent.dispose();
  }
}
