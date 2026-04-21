import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { type ParsedEvent } from '../../shared/types';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'str_replace_editor', 'str_replace_based_edit_tool']);

function computeLineDelta(toolName: string, input: any): { linesAdded: number; linesRemoved: number } {
  if (toolName === 'Write') {
    const lines = String(input?.content ?? '').split('\n').length;
    return { linesAdded: lines, linesRemoved: 0 };
  }
  const oldStr = String(input?.old_str ?? input?.old_string ?? '');
  const newStr = String(input?.new_str ?? input?.new_string ?? input?.new_content ?? '');
  return {
    linesAdded: newStr ? newStr.split('\n').length : 0,
    linesRemoved: oldStr ? oldStr.split('\n').length : 0,
  };
}

export function translateSdkMessage(message: SDKMessage): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  if (message.type === 'assistant') {
    for (const block of ((message as any).message?.content ?? [])) {
      if (block.type === 'text' && block.text?.trim()) {
        events.push({ type: 'agent_message', text: block.text });
      }
      if (block.type === 'thinking' && block.thinking) {
        events.push({ type: 'thought', status: 'ready', text: block.thinking });
      }
      if (block.type === 'tool_use') {
        // AskUserQuestion is handled via canUseTool callback — skip tool_call events for it
        if (block.name === 'AskUserQuestion') { continue; }
        events.push({
          type: 'tool_call_start',
          toolName: block.name,
          args: JSON.stringify(block.input),
        });
        if (EDIT_TOOLS.has(block.name)) {
          const delta = computeLineDelta(block.name, block.input);
          if (delta.linesAdded > 0 || delta.linesRemoved > 0) {
            events.push({ type: 'stats_update', ...delta });
          }
        }
      }
    }
  }

  if (message.type === 'stream_event') {
    const ev = (message as any).event as Record<string, any>;
    if (ev?.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
      events.push({ type: 'thought', status: 'loading', text: '' });
    }
  }

  if (message.type === 'result') {
    const usage = (message as any).result?.usage ?? (message as any).usage;
    const inputTokens: number | undefined =
      usage?.input_tokens ?? usage?.cache_read_input_tokens;
    events.push({ type: 'session_finished', inputTokens });
  }

  return events;
}
