import { useState } from 'react';
import type { WebSocketClient } from '../utils/WebSocketClient';
import type { ParsedEvent } from '@shared/types';

interface Props {
  event: ParsedEvent & { type: 'permission_request' };
  sessionId: string;
  client: WebSocketClient;
  onDismiss: () => void;
}

export function MobilePermissionCard({ event, sessionId, client, onDismiss }: Props) {
  const [responded, setResponded] = useState(false);

  const respond = (allowed: boolean) => {
    if (responded) { return; }
    setResponded(true);
    if (!client.isReadOnly) {
      client.send({ type: 'respond_permission', sessionId, requestId: event.requestId, allowed });
    }
    onDismiss();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#1e1e32', borderRadius: '20px 20px 0 0',
        padding: '24px 20px 40px', maxHeight: '70vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'rgba(255,193,7,0.15)',
            border: '1px solid rgba(255,193,7,0.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 18, flexShrink: 0,
          }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Permission Required</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Claude wants to use a tool</div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tool</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#e0e0ff', fontWeight: 600 }}>{event.action}</div>
        </div>

        {event.context && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', marginBottom: 20,
            fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
            maxHeight: 120, overflow: 'hidden',
          }}>
            {event.context}
          </div>
        )}

        {client.isReadOnly && (
          <div style={{
            background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#ffc107',
          }}>
            Read-only mode — you cannot respond to permissions
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => respond(false)}
            disabled={responded || client.isReadOnly}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              background: 'rgba(241,76,76,0.15)', color: '#f14c4c',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              opacity: responded || client.isReadOnly ? 0.4 : 1,
            }}
          >
            Deny
          </button>
          <button
            onClick={() => respond(true)}
            disabled={responded || client.isReadOnly}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              background: '#0e639c', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              opacity: responded || client.isReadOnly ? 0.4 : 1,
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
