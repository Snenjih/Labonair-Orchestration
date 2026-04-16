import { useEffect, useRef, useState } from 'react';
import { vscode } from './utils/vscode';
import { ParsedEvent } from './types';
import AgentStreamView from './components/AgentStreamView';
import AgentFormDropdowns from './components/AgentFormDropdowns';
import MessageInput from './components/MessageInput';
import TerminalEmulator, { TerminalEmulatorHandle } from './components/TerminalEmulator';
import ViewToggles, { ViewMode } from './components/ViewToggles';

interface SessionMeta {
  sessionId: string;
  status: string;
}

export default function App() {
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [history, setHistory] = useState<ParsedEvent[]>([]);
  const [dismissedPermissions, setDismissedPermissions] = useState<Set<number>>(new Set());
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [selectedEffort, setSelectedEffort] = useState('standard');
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('ui');

  const terminalRef = useRef<TerminalEmulatorHandle>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'initialState':
          setSession({ sessionId: message.payload.sessionId, status: message.payload.status });
          if (Array.isArray(message.payload.history)) {
            setHistory(message.payload.history as ParsedEvent[]);
          }
          // Replay raw terminal history
          if (message.payload.rawBuffer) {
            terminalRef.current?.writeOutput(message.payload.rawBuffer);
          }
          break;
        case 'parsed_event':
          setHistory(h => [...h, message.payload as ParsedEvent]);
          break;
        case 'raw_output':
          terminalRef.current?.writeOutput(message.payload as string);
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
    setHistory(h => [...h, { type: 'user_message', text }]);
    vscode.postMessage({
      type: 'submit',
      payload: { text, config: { model: selectedModel, effort: selectedEffort } }
    });
    setFileSuggestions([]);
  }

  const showUi = viewMode === 'ui' || viewMode === 'split';
  const showTerminal = viewMode === 'terminal' || viewMode === 'split';

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__title">
          {session ? `Session ${session.sessionId.slice(0, 6)}` : 'Loading…'}
        </span>
        <ViewToggles mode={viewMode} onChangeViewMode={setViewMode} />
      </header>

      <div className={`app-content app-content--${viewMode}`}>
        {/* Always mounted so xterm canvas is never destroyed; hidden via CSS */}
        <AgentStreamView
          history={history}
          dismissedPermissions={dismissedPermissions}
          onPermissionRespond={handlePermissionRespond}
          hidden={!showUi}
        />
        <TerminalEmulator ref={terminalRef} hidden={!showTerminal} />
      </div>

      <div className="footer">
        <AgentFormDropdowns
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedEffort={selectedEffort}
          onEffortChange={setSelectedEffort}
        />
        <MessageInput
          fileSuggestions={fileSuggestions}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
