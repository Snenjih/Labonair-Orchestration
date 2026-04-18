import { useEffect, useRef } from 'react';
import { ParsedEvent } from '../types';
import { UserMessage, AssistantMessage } from './Message';
import ThoughtItem from './ThoughtItem';
import ToolCall from './ToolCall';
import PermissionRequestCard from './PermissionRequestCard';

interface ToolCallGroup {
  kind: 'tool_call';
  toolName: string;
  args?: string;
  output?: string;
  endStatus?: 'completed' | 'failed' | null;
  key: number;
}

interface SimpleItem {
  kind: 'simple';
  event: ParsedEvent;
  key: number;
}

type DisplayItem = SimpleItem | ToolCallGroup;

// Collapse the flat event stream into renderable display items.
function buildDisplayItems(events: ParsedEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let toolGroup: ToolCallGroup | null = null;

  events.forEach((event, i) => {
    if (event.type === 'tool_call_start') {
      toolGroup = { kind: 'tool_call', toolName: event.toolName, args: event.args, endStatus: null, key: i };
      items.push(toolGroup);
      return;
    }
    if (event.type === 'tool_call_output' && toolGroup) {
      toolGroup.output = (toolGroup.output ?? '') + event.output;
      return;
    }
    if (event.type === 'tool_call_end' && toolGroup) {
      toolGroup.endStatus = event.status;
      toolGroup = null;
      return;
    }
    items.push({ kind: 'simple', event, key: i });
  });

  return items;
}

interface Props {
  history: ParsedEvent[];
  dismissedPermissions: Set<number>;
  onPermissionRespond: (index: number, allowed: boolean) => void;
  hidden?: boolean;
}

export default function AgentStreamView({ history, dismissedPermissions, onPermissionRespond, hidden }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  const items = buildDisplayItems(history);

  return (
    <div className="stream-view" style={hidden ? { display: 'none' } : undefined}>
      {items.map(item => {
        if (item.kind === 'tool_call') {
          return (
            <ToolCall
              key={item.key}
              toolName={item.toolName}
              args={item.args}
              output={item.output}
              endStatus={item.endStatus}
            />
          );
        }

        const { event, key } = item;

        switch (event.type) {
          case 'user_message':
            return <UserMessage key={key} text={event.text} />;
          case 'agent_message':
            return <AssistantMessage key={key} text={event.text} />;
          case 'thought':
            return <ThoughtItem key={key} status={event.status} text={event.text} />;
          case 'permission_request':
            if (dismissedPermissions.has(key)) { return null; }
            return (
              <PermissionRequestCard
                key={key}
                action={event.action}
                context={event.context}
                requestId={event.requestId}
                onRespond={(allowed) => onPermissionRespond(key, allowed)}
              />
            );
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}
