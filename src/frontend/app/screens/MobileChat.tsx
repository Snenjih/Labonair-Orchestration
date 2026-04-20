import { useEffect, useState, useRef } from 'react';
import type { WebSocketClient, WsMsg } from '../utils/WebSocketClient';
import type { ParsedEvent, SessionStatus } from '@shared/types';
import { MobilePermissionCard } from '../components/MobilePermissionCard';
import { MobileToolCall } from '../components/MobileToolCall';
import { MobileMessageInput } from '../components/MobileMessageInput';

interface Props {
  client: WebSocketClient;
  sessionId: string;
  onBack: () => void;
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: 'rgba(255,255,255,0.3)',
  working: '#4fc1ff',
  permission_required: '#ffc107',
  finished: '#4ec9b0',
  error: '#f14c4c',
};

export function MobileChat({ client, sessionId, onBack }: Props) {
  const [history, setHistory] = useState<ParsedEvent[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [label, setLabel] = useState('Session');
  const [pendingPerm, setPendingPerm] = useState<(ParsedEvent & { type: 'permission_request' }) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.send({ type: 'subscribe_session', sessionId });

    const offs = [
      client.on('session_history', (msg: WsMsg) => {
        if (msg.sessionId !== sessionId) { return; }
        setHistory((msg.history as ParsedEvent[]) ?? []);
        setStatus((msg.status as SessionStatus) ?? 'idle');
        setLabel((msg.label as string) ?? 'Session');
      }),
      client.on('session_event', (msg: WsMsg) => {
        if (msg.sessionId !== sessionId) { return; }
        const event = msg.event as ParsedEvent;
        setHistory(prev => [...prev, event]);
        if (event.type === 'permission_request') { setPendingPerm(event); }
      }),
      client.on('session_status', (msg: WsMsg) => {
        if (msg.sessionId !== sessionId) { return; }
        setStatus((msg.status as SessionStatus) ?? 'idle');
      }),
      client.on('sessions', (msg: WsMsg) => {
        const sessions = (msg.sessions as Array<{ id: string; status: SessionStatus; label: string }>) ?? [];
        const s = sessions.find(x => x.id === sessionId);
        if (s) { setStatus(s.status); setLabel(s.label); }
      }),
    ];

    return () => {
      offs.forEach(off => off());
      client.send({ type: 'unsubscribe_session', sessionId });
    };
  }, [client, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const sendMessage = (text: string) => {
    client.send({ type: 'send_message', sessionId, text });
  };

  const interrupt = () => {
    client.send({ type: 'interrupt_session', sessionId });
  };

  const isWorking = status === 'working';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#1a1a2e', color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        background: '#1e1e32', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 18,
        }}>‹</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          <div style={{ fontSize: 11, color: STATUS_COLOR[status], marginTop: 1 }}>
            {status === 'working' ? 'Working…' : status === 'permission_required' ? 'Needs permission' : status}
          </div>
        </div>

        {isWorking && !client.isReadOnly && (
          <button onClick={interrupt} style={{
            padding: '5px 10px', border: '1px solid rgba(241,76,76,0.4)',
            borderRadius: 8, background: 'rgba(241,76,76,0.1)', color: '#f14c4c',
            fontSize: 11, cursor: 'pointer',
          }}>Stop</button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {history.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.3 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>No messages yet</div>
          </div>
        )}

        {renderHistory(history, sessionId, client)}
        <div ref={bottomRef} />
      </div>

      {/* Permission card overlay */}
      {pendingPerm && (
        <MobilePermissionCard
          event={pendingPerm}
          sessionId={sessionId}
          client={client}
          onDismiss={() => setPendingPerm(null)}
        />
      )}

      {/* Input */}
      <MobileMessageInput
        onSend={sendMessage}
        disabled={isWorking}
        readOnly={client.isReadOnly}
      />
    </div>
  );
}

function renderHistory(history: ParsedEvent[], sessionId: string, client: WebSocketClient) {
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < history.length) {
    const event = history[i];

    if (event.type === 'user_message') {
      elements.push(
        <div key={i} style={{
          alignSelf: 'flex-end', maxWidth: '80%',
          background: '#0e639c', borderRadius: '16px 16px 4px 16px',
          padding: '10px 13px', fontSize: 14, lineHeight: 1.45,
        }}>
          {event.text}
        </div>
      );
    } else if (event.type === 'agent_message') {
      elements.push(
        <div key={i} style={{
          alignSelf: 'flex-start', maxWidth: '90%',
          background: 'rgba(255,255,255,0.06)', borderRadius: '4px 16px 16px 16px',
          padding: '10px 13px', fontSize: 14, lineHeight: 1.55,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {event.text}
        </div>
      );
    } else if (event.type === 'thought') {
      if (event.status === 'ready' && event.text) {
        elements.push(
          <details key={i} style={{ fontSize: 12, opacity: 0.5 }}>
            <summary style={{ cursor: 'pointer', padding: '4px 0' }}>Thinking…</summary>
            <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.1)', lineHeight: 1.5 }}>
              {event.text}
            </div>
          </details>
        );
      }
    } else if (event.type === 'tool_call_start') {
      // Collect associated output + end
      const start = event;
      let output: (ParsedEvent & { type: 'tool_call_output' }) | undefined;
      let end: (ParsedEvent & { type: 'tool_call_end' }) | undefined;
      let j = i + 1;
      while (j < history.length) {
        if (history[j].type === 'tool_call_output') {
          output = history[j] as ParsedEvent & { type: 'tool_call_output' };
          j++;
        } else if (history[j].type === 'tool_call_end') {
          end = history[j] as ParsedEvent & { type: 'tool_call_end' };
          j++;
          break;
        } else { break; }
      }
      elements.push(<MobileToolCall key={i} start={start} output={output} end={end} />);
      i = j;
      continue;
    } else if (event.type === 'permission_request') {
      elements.push(
        <div key={i} style={{
          background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)',
          borderRadius: 10, padding: '10px 12px', fontSize: 12,
        }}>
          <span style={{ color: '#ffc107' }}>⚠ Permission requested: </span>
          <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>{event.action}</span>
        </div>
      );
    } else if (event.type === 'hook_event') {
      elements.push(
        <div key={i} style={{ fontSize: 10, opacity: 0.35, textAlign: 'center', padding: '2px 0' }}>
          [{event.hookType}] {event.message}
        </div>
      );
    } else if (event.type === 'session_finished') {
      elements.push(
        <div key={i} style={{ fontSize: 11, opacity: 0.35, textAlign: 'center', padding: '4px 0' }}>
          — Session finished{event.inputTokens ? ` · ${event.inputTokens.toLocaleString()} tokens` : ''} —
        </div>
      );
    }

    i++;
  }

  return elements;
}
