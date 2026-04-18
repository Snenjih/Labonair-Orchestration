import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { type ParsedEvent } from '../shared/types';

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
        events.push({
          type: 'tool_call_start',
          toolName: block.name,
          args: JSON.stringify(block.input),
        });
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
    events.push({ type: 'session_finished' });
  }

  return events;
}
