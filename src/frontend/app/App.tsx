import { useState, useEffect } from 'react';
import { WebSocketClient } from './utils/WebSocketClient';
import { MobileHome } from './screens/MobileHome';
import { MobileChat } from './screens/MobileChat';

type Screen = 'connecting' | 'error' | 'home' | 'chat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('connecting');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [client, setClient] = useState<WebSocketClient | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('t') ?? sessionStorage.getItem('labonair.bridge.token') ?? '';

    if (!token) {
      setError('No token found. Please scan the QR code from Labonair Bridge settings.');
      setScreen('error');
      return;
    }

    sessionStorage.setItem('labonair.bridge.token', token);

    const host = window.location.host;
    const ws = new WebSocketClient(host, token);

    ws.on('auth_success', () => setScreen('home'));
    ws.on('auth_failed', (msg) => {
      setError(`Authentication failed: ${msg.reason as string}`);
      setScreen('error');
    });
    ws.on('disconnected', () => {
      if (screen !== 'error') { setScreen('connecting'); }
    });

    ws.connect();
    setClient(ws);

    return () => ws.disconnect();
  }, []);

  const openSession = (id: string) => {
    setSessionId(id);
    setScreen('chat');
  };

  const goHome = () => {
    setSessionId(null);
    setScreen('home');
  };

  if (screen === 'error') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: '2rem', textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#1a1a2e', color: '#fff',
      }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
          <h2 style={{ marginBottom: 12, fontWeight: 700 }}>Connection Error</h2>
          <p style={{ opacity: 0.55, lineHeight: 1.6, maxWidth: 300 }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24, padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#0e639c', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'connecting') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#1a1a2e', color: '#fff', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 36 }}>⚡</div>
        <div style={{ fontSize: 15, opacity: 0.6 }}>Connecting to Labonair Bridge…</div>
      </div>
    );
  }

  if (screen === 'chat' && sessionId && client) {
    return <MobileChat client={client} sessionId={sessionId} onBack={goHome} />;
  }

  return client ? <MobileHome client={client} onOpenSession={openSession} /> : null;
}
