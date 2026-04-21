import { useEffect, useState } from 'react';
import { vscode } from './utils/vscode';
import { ParsedEvent } from '@shared/types';
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
  const [slashCommands, setSlashCommands] = useState<{ name: string; description: string; argumentHint?: string; clientOnly?: boolean }[]>([]);
  const [contextTokens, setContextTokens] = useState(0);
  const [fastMode, setFastMode] = useState(false);
  const [linesAdded, setLinesAdded] = useState(0);
  const [linesRemoved, setLinesRemoved] = useState(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'initialState': {
          setSession({ sessionId: message.payload.sessionId, status: message.payload.status });
          setStatus(message.payload.status ?? 'idle');
          setHasApiKey(message.payload.hasApiKey ?? false);
          if (message.payload.label) { setSessionLabel(message.payload.label); }
          if (message.payload.defaultModel) { setSelectedModel(message.payload.defaultModel); }
          if (message.payload.defaultEffort) { setSelectedEffort(message.payload.defaultEffort); }
          if (Array.isArray(message.payload.history)) {
            const hist = message.payload.history as ParsedEvent[];
            setHistory(hist);
            let added = 0, removed = 0;
            for (const e of hist) {
              if (e.type === 'stats_update') { added += e.linesAdded; removed += e.linesRemoved; }
            }
            setLinesAdded(added);
            setLinesRemoved(removed);
          }
          break;
        }
        case 'api_key_saved':
          setHasApiKey(true);
          break;
        case 'parsed_event': {
          const ev = message.payload as ParsedEvent;
          setHistory(h => [...h, ev]);
          if (ev.type === 'stats_update') {
            setLinesAdded(n => n + ev.linesAdded);
            setLinesRemoved(n => n + ev.linesRemoved);
          }
          break;
        }
        case 'status_update':
          setStatus(message.payload as string);
          break;
        case 'file_suggestions':
          setFileSuggestions(message.payload as string[]);
          break;
        case 'slash_commands':
          setSlashCommands(message.payload as { name: string; description: string; argumentHint?: string; clientOnly?: boolean }[]);
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

  function handleSubmit(text: string, images?: Array<{ mediaType: string; data: string }>) {
    vscode.postMessage({
      type: 'submit',
      payload: { text, config: { model: selectedModel, effort: selectedEffort }, images: images ?? [] }
    });
    setFileSuggestions([]);
  }

  function handleRequestFileSuggestions(query: string) {
    setFileSuggestions([]);
    vscode.postMessage({ type: 'requestFileSuggestions', query });
  }

  function handleRequestSlashCommands() {
    vscode.postMessage({ type: 'requestSlashCommands' });
  }

  function handleInterrupt() {
    vscode.postMessage({ type: 'interrupt' });
  }

  function handleFastModeChange(enabled: boolean) {
    setFastMode(enabled);
    vscode.postMessage({ type: 'set_fast_mode', payload: enabled });
  }

  function handleFork() {
    vscode.postMessage({ type: 'forkSession' });
  }

  function handleExport() {
    vscode.postMessage({ type: 'exportSession' });
  }

  function handleClear() {
    setHistory([]);
    setContextTokens(0);
    setLinesAdded(0);
    setLinesRemoved(0);
    vscode.postMessage({ type: 'clearHistory' });
  }

  const isWorking = status === 'working';

  if (hasApiKey === false) {
    return <ApiKeySetup />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__left">
          {isWorking && <span className="orbit-ring" aria-hidden="true" />}
        </div>
        <span className="app-header__title">
          {sessionLabel || (session ? `Session ${session.sessionId.slice(0, 6)}` : 'Loading…')}
        </span>
        <div className="app-header__actions">
          {(linesAdded > 0 || linesRemoved > 0) && (
            <span className="line-stats" title="Lines changed this session">
              {linesAdded > 0 && <span className="line-stats__added">+{linesAdded}</span>}
              {linesRemoved > 0 && <span className="line-stats__removed">-{linesRemoved}</span>}
            </span>
          )}
          <button className="app-header__btn" title="Export session" aria-label="Export session" onClick={handleExport}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button className="app-header__btn" title="Fork session" aria-label="Fork session" onClick={handleFork}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </button>
        </div>
      </header>

      <div className="app-content">
        {history.length === 0 && !isWorking ? (
          <div className="empty-state">
            <svg className="empty-state__ghost" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
              <path fill="#FFFFFF" d="M20.952,52.828l-0.141,0.145l-0.807,0.821c-1.896,1.896-6.636,1.896-7.584,0.948c-0.947-0.948,0-1.914,0-1.914c1.896-1.878,2.844-3.682,2.844-6.144v-7.584V24.882c0-9.163,7.428-16.59,16.589-16.59l0,0c9.163,0,16.59,7.428,16.59,16.59v14.219c0,0,0,6.162,0,9.006c0,1.896-0.947,3.792-2.844,5.688c-1.896,1.896-6.637,1.896-7.584,0.948s0-1.914,0-1.914c-1.767,1.505-3.142,2.766-5.517,2.766c-2.646,0-4.207-1.33-3.437-2.337c-0.813,1.16-3.626,2.337-5.626,2.337C21.25,55.594,19.82,54.489,20.952,52.828z"/>
              <path fill="#E0E0E0" d="M31.854,8.292c-0.678,0-1.343,0.053-2,0.132c8.218,0.99,14.59,7.974,14.59,16.458v14.219c0,0,0,6.162,0,9.006c0,1.896-0.947,3.792-2.844,5.688c-0.674,0.674-1.707,1.104-2.801,1.342c1.696,0.497,5.226,0.233,6.801-1.342c1.896-1.896,2.844-3.791,2.844-5.688c0-2.844,0-9.006,0-9.006V24.882C48.444,15.719,41.018,8.292,31.854,8.292z"/>
              <ellipse fill="#414B5D" cx="34.5" cy="37" rx="3.5" ry="5"/>
              <ellipse fill="#414B5D" cx="29.959" cy="23.459" rx="2.37" ry="4.74"/>
              <ellipse fill="#414B5D" cx="38.49" cy="23.459" rx="2.37" ry="4.74"/>
              <path fill="#242A38" d="M29.958,18.72c-0.358,0-0.694,0.171-0.999,0.456c0.808,0.755,1.37,2.383,1.37,4.283s-0.563,3.528-1.37,4.284c0.305,0.285,0.641,0.456,0.999,0.456c1.311,0,2.371-2.122,2.371-4.74S31.269,18.72,29.958,18.72z"/>
              <path fill="#242A38" d="M38.491,18.72c-0.359,0-0.696,0.171-1.001,0.456c0.808,0.756,1.37,2.383,1.37,4.283s-0.563,3.528-1.37,4.284c0.305,0.285,0.642,0.456,1.001,0.456c1.309,0,2.369-2.122,2.369-4.74S39.8,18.72,38.491,18.72z"/>
              <path fill="#242A38" d="M34.5,32c-0.539,0-1.044,0.188-1.5,0.5c1.179,0.804,2,2.509,2,4.5s-0.821,3.696-2,4.5c0.456,0.312,0.961,0.5,1.5,0.5c1.933,0,3.5-2.238,3.5-5S36.433,32,34.5,32z"/>
              <path fill="#272223" d="M31.854,7.292c-9.699,0-17.589,7.891-17.589,17.59v21.803c0,2.067-0.738,3.641-2.558,5.443c-0.66,0.672-1.202,2.111,0.007,3.321c0.771,0.771,2.317,0.915,3.363,0.915c0.365,0,0.669-0.018,0.858-0.032c1.592-0.123,3-0.563,4.025-1.235c0.085,0.119,0.17,0.237,0.285,0.353c0.771,0.771,2.318,0.915,3.363,0.915c0.365,0,0.67-0.018,0.858-0.032c1.592-0.123,3.001-0.563,4.025-1.235c0.085,0.118,0.171,0.237,0.286,0.353c0.77,0.771,2.317,0.915,3.362,0.915c0.365,0,0.669-0.018,0.857-0.032c1.592-0.123,3.001-0.563,4.026-1.235c0.085,0.118,0.17,0.237,0.285,0.353c1.038,1.04,3.49,0.938,4.22,0.883c2.029-0.156,3.771-0.823,4.778-1.831c2.081-2.08,3.137-4.231,3.137-6.395V24.882C49.444,15.183,41.554,7.292,31.854,7.292z M47.444,48.106c0,1.613-0.858,3.289-2.551,4.98c-1.582,1.582-5.586,1.429-6.17,0.948c-0.1-0.1-0.235-0.236,0.018-0.519c0.05-0.052,0.074-0.115,0.11-0.175c0.031-0.051,0.075-0.097,0.097-0.152c0.027-0.071,0.03-0.146,0.041-0.222c0.007-0.052,0.027-0.101,0.026-0.153c-0.001-0.083-0.028-0.163-0.05-0.244c-0.012-0.043-0.01-0.088-0.027-0.129c-0.05-0.119-0.124-0.23-0.222-0.327c-0.394-0.388-1.029-0.38-1.414,0.014l-0.94,0.959c-1.584,1.583-5.587,1.426-6.17,0.948c-0.1-0.1-0.236-0.236,0.018-0.518c0.06-0.063,0.092-0.137,0.132-0.209c0.022-0.04,0.058-0.074,0.074-0.117c0.031-0.079,0.036-0.163,0.046-0.246c0.005-0.044,0.023-0.086,0.022-0.129c-0.001-0.086-0.028-0.168-0.051-0.251c-0.011-0.041-0.01-0.084-0.025-0.123c-0.05-0.119-0.124-0.231-0.222-0.327c-0.396-0.388-1.028-0.383-1.414,0.012l-0.943,0.96c-1.583,1.584-5.587,1.429-6.17,0.948c-0.1-0.1-0.235-0.236,0.018-0.518c0.056-0.059,0.086-0.131,0.125-0.198c0.025-0.044,0.063-0.083,0.082-0.129c0.028-0.073,0.031-0.15,0.042-0.228c0.007-0.05,0.026-0.098,0.025-0.148c-0.001-0.082-0.028-0.162-0.05-0.242c-0.011-0.043-0.01-0.089-0.027-0.131c-0.05-0.119-0.124-0.23-0.222-0.327c-0.395-0.388-1.028-0.38-1.414,0.014l-0.94,0.959c-1.583,1.583-5.586,1.428-6.169,0.948c-0.1-0.1-0.237-0.236-0.004-0.496c2.201-2.181,3.141-4.23,3.141-6.854V24.882c0-8.597,6.994-15.59,15.589-15.59c8.597,0,15.59,6.994,15.59,15.59V48.106z"/>
            </svg>
            <span className="empty-state__title">Labonair</span>
            <span className="empty-state__subtitle">AI Agents</span>
          </div>
        ) : (
          <AgentStreamView
            history={history}
            dismissedPermissions={dismissedPermissions}
            onPermissionRespond={handlePermissionRespond}
            isWorking={isWorking}
          />
        )}
      </div>

      <div className="footer">
        <MessageInput
          fileSuggestions={fileSuggestions}
          slashCommands={slashCommands}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
          onClear={handleClear}
          fastMode={fastMode}
          onFastModeChange={handleFastModeChange}
          onRequestFileSuggestions={handleRequestFileSuggestions}
          onRequestSlashCommands={handleRequestSlashCommands}
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
