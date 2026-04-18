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
  const [sessionLabel, setSessionLabel] = useState<string>('');
  const [status, setStatus] = useState<string>('idle');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); // null = unknown
  const [history, setHistory] = useState<ParsedEvent[]>([]);
  const [dismissedPermissions, setDismissedPermissions] = useState<Set<number>>(new Set());
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [selectedEffort, setSelectedEffort] = useState('medium');
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [contextTokens, setContextTokens] = useState(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'initialState':
          setSession({ sessionId: message.payload.sessionId, status: message.payload.status });
          setStatus(message.payload.status ?? 'idle');
          setHasApiKey(message.payload.hasApiKey ?? false);
          if (message.payload.label) { setSessionLabel(message.payload.label); }
          if (message.payload.defaultModel) { setSelectedModel(message.payload.defaultModel); }
          if (message.payload.defaultEffort) { setSelectedEffort(message.payload.defaultEffort); }
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
        case 'context_update':
          setContextTokens(message.payload as number);
          break;
        case 'label_update':
          setSessionLabel(message.payload as string);
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

  function handleClear() {
    setHistory([]);
    setContextTokens(0);
    vscode.postMessage({ type: 'clearHistory' });
  }

  const isWorking = status === 'working';

  if (hasApiKey === false) {
    return <ApiKeySetup />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__title">
          {sessionLabel || (session ? `Session ${session.sessionId.slice(0, 6)}` : 'Loading…')}
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
          onClear={handleClear}
          isWorking={isWorking}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedEffort={selectedEffort}
          onEffortChange={setSelectedEffort}
          contextTokens={contextTokens}
          contextMaxTokens={200000}
        />
      </div>
    </div>
  );
}
