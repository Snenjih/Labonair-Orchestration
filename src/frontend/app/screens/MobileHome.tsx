import { useEffect, useState } from 'react';
import type { WebSocketClient, WsMsg } from '../utils/WebSocketClient';
import type { SessionStatus } from '@shared/types';

interface SessionSummary {
  id: string;
  label: string;
  status: SessionStatus;
  parentId?: string;
}

interface Props {
  client: WebSocketClient;
  onOpenSession: (id: string) => void;
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: 'rgba(255,255,255,0.25)',
  working: '#4fc1ff',
  permission_required: '#ffc107',
  finished: '#4ec9b0',
  error: '#f14c4c',
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Idle',
  working: 'Working…',
  permission_required: 'Needs permission',
  finished: 'Finished',
  error: 'Error',
};

export function MobileHome({ client, onOpenSession }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = () => {
    client.send({ type: 'get_sessions' });
  };

  useEffect(() => {
    fetchSessions();
    const off = client.on('sessions', (msg: WsMsg) => {
      setSessions((msg.sessions as SessionSummary[]) ?? []);
    });
    return off;
  }, [client]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSessions();
    setTimeout(() => setRefreshing(false), 800);
  };

  const roots = sessions.filter(s => !s.parentId);
  const childrenOf = (id: string) => sessions.filter(s => s.parentId === id);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#1a1a2e', color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        background: '#1e1e32', borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.4, marginBottom: 2 }}>Labonair Bridge</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sessions</div>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: 16,
            transform: refreshing ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.4s',
          }}
        >↻</button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.35 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14 }}>No sessions open</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Create a session in Labonair on your desktop</div>
          </div>
        ) : (
          roots.map(session => (
            <div key={session.id}>
              <SessionCard session={session} onOpen={onOpenSession} />
              {childrenOf(session.id).map(child => (
                <div key={child.id} style={{ marginLeft: 20, borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: 8 }}>
                  <SessionCard session={child} onOpen={onOpenSession} isChild />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        background: '#1e1e32', borderTop: '1px solid rgba(255,255,255,0.07)',
        fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center',
      }}>
        {client.isReadOnly ? '👁 Read-only mode' : '● Connected'}
      </div>
    </div>
  );
}

function SessionCard({ session, onOpen, isChild }: { session: SessionSummary; onOpen: (id: string) => void; isChild?: boolean }) {
  const color = STATUS_COLOR[session.status] ?? 'rgba(255,255,255,0.25)';
  const label = STATUS_LABEL[session.status] ?? session.status;
  const isWorking = session.status === 'working';
  const needsPerm = session.status === 'permission_required';

  return (
    <button
      onClick={() => onOpen(session.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '12px 14px', marginBottom: 8, border: 'none',
        background: needsPerm ? 'rgba(255,193,7,0.06)' : 'rgba(255,255,255,0.04)',
        borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        borderWidth: 1, borderStyle: 'solid',
        borderColor: needsPerm ? 'rgba(255,193,7,0.25)' : 'rgba(255,255,255,0.06)',
      }}
    >
      <div style={{
        width: 10, height: 10, borderRadius: '50%', background: color,
        flexShrink: 0,
        animation: isWorking ? 'mobilePulse 1.2s ease-in-out infinite' : 'none',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isChild ? '↳ ' : ''}{session.label}
        </div>
        <div style={{ fontSize: 11, marginTop: 2, color }}>
          {label}
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>›</div>
    </button>
  );
}
