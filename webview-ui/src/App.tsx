import { useEffect, useState } from 'react';
import { vscode } from './utils/vscode';
import { ParsedEvent } from './types';
import AgentStreamView from './components/AgentStreamView';
import MessageInput from './components/MessageInput';
import ApiKeySetup from './components/ApiKeySetup';

interface SessionMeta {
  sessionId: string;
  status: string;
}

export default function App() {
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); // null = unknown
  const [history, setHistory] = useState<ParsedEvent[]>([]);
  const [dismissedPermissions, setDismissedPermissions] = useState<Set<number>>(new Set());
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [selectedEffort, setSelectedEffort] = useState('medium');
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'initialState':
          setSession({ sessionId: message.payload.sessionId, status: message.payload.status });
          setStatus(message.payload.status ?? 'idle');
          setHasApiKey(message.payload.hasApiKey ?? false);
          if (Array.isArray(message.payload.history)) {
            setHistory(message.payload.history as ParsedEvent[]);
          }
          break;
        case 'api_key_saved':
          setHasApiKey(true);
          break;
        case 'parsed_event':
          setHistory(h => [...h, message.payload as ParsedEvent]);
          break;
        case 'status_update':
          setStatus(message.payload as string);
          break;
        case 'file_suggestions':
          setFileSuggestions(message.payload as string[]);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    vscode.postMessage({ type: 'requestInitialState' });
  }, []);

  function handlePermissionRespond(index: number, allowed: boolean) {
    setDismissedPermissions(prev => new Set(prev).add(index));
    vscode.postMessage({ type: 'respondToPermission', allowed });
  }

  function handleSubmit(text: string) {
    vscode.postMessage({
      type: 'submit',
      payload: { text, config: { model: selectedModel, effort: selectedEffort } }
    });
    setFileSuggestions([]);
  }

  function handleInterrupt() {
    vscode.postMessage({ type: 'interrupt' });
  }

  const isWorking = status === 'working';

  if (hasApiKey === false) {
    return <ApiKeySetup />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__title">
          {session ? `Session ${session.sessionId.slice(0, 6)}` : 'Loading…'}
        </span>
      </header>

      <div className="app-content">
        <AgentStreamView
          history={history}
          dismissedPermissions={dismissedPermissions}
          onPermissionRespond={handlePermissionRespond}
          isWorking={isWorking}
        />
      </div>

      <div className="footer">
        <MessageInput
          fileSuggestions={fileSuggestions}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
          isWorking={isWorking}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedEffort={selectedEffort}
          onEffortChange={setSelectedEffort}
        />
      </div>
    </div>
  );
}
