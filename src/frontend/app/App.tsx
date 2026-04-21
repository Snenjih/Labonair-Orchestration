import { useState, useEffect, useRef } from 'react';
import { WebSocketClient } from './utils/WebSocketClient';
import { MobileHome } from './screens/MobileHome';
import { MobileChat } from './screens/MobileChat';

type Screen = 'connecting' | 'error' | 'home' | 'chat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('connecting');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Ref so event handlers always read the current screen without stale closure
  const screenRef = useRef<Screen>('connecting');
  const setScreenSynced = (s: Screen) => {
    screenRef.current = s;
    setScreen(s);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('t') ?? sessionStorage.getItem('labonair.bridge.token') ?? '';

    if (!token) {
      setError('No token found. Please scan the QR code from Labonair Bridge settings.');
      setScreenSynced('error');
      return;
    }

    sessionStorage.setItem('labonair.bridge.token', token);

    const host = window.location.host;
    const ws = new WebSocketClient(host, token);

    ws.on('auth_success', () => {
      setScreenSynced('home');
    });

    ws.on('auth_failed', (msg) => {
      setError(`Authentication failed: ${(msg.reason as string) ?? 'Invalid token. Try rotating the token in Labonair Bridge settings and re-scanning the QR code.'}`);
      setScreenSynced('error');
    });

    ws.on('disconnected', () => {
      // Only go back to "connecting" if we weren't already in an error or stable state
      if (screenRef.current === 'connecting' || screenRef.current === 'home') {
        setScreenSynced('connecting');
        setReconnectCount(c => c + 1);
      }
    });

    ws.connect();
    setClient(ws);

    return () => ws.disconnect();
  }, []);

  const openSession = (id: string) => {
    setSessionId(id);
    setScreenSynced('chat');
  };

  const goHome = () => {
    setSessionId(null);
    setScreenSynced('home');
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
        <div style={{ fontSize: 15, opacity: 0.6 }}>
          {reconnectCount > 0 ? `Reconnecting… (attempt ${reconnectCount + 1})` : 'Connecting to Labonair Bridge…'}
        </div>
        {reconnectCount > 2 && (
          <div style={{ fontSize: 12, opacity: 0.4, maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
            Make sure Bridge is enabled in Labonair settings and you're on the same Wi-Fi network.
          </div>
        )}
      </div>
    );
  }

  if (screen === 'chat' && sessionId && client) {
    return <MobileChat client={client} sessionId={sessionId} onBack={goHome} />;
  }

  return client ? <MobileHome client={client} onOpenSession={openSession} /> : null;
}
