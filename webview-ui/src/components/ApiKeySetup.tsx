import { useState } from 'react';
import { vscode } from '../utils/vscode';

type Screen = 'choose' | 'manual';

export default function ApiKeySetup() {
  const [screen, setScreen] = useState<Screen>('choose');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  function handleUseClaudeCode() {
    vscode.postMessage({ type: 'useClaudeCodeAuth' });
  }

  function handleSaveManual() {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-');
      return;
    }
    vscode.postMessage({ type: 'setApiKey', payload: trimmed });
  }

  if (screen === 'manual') {
    return (
      <div className="apikey-overlay">
        <div className="apikey-card">
          <button className="apikey-back" onClick={() => { setScreen('choose'); setError(''); setKey(''); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>

          <div className="apikey-card__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <h2 className="apikey-card__title">Enter your API Key</h2>
          <p className="apikey-card__desc">
            Stored securely in the OS keychain. Never leaves your machine.
          </p>

          <input
            className="apikey-input"
            type="password"
            placeholder="sk-ant-api03-…"
            value={key}
            onChange={e => { setKey(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { handleSaveManual(); } }}
            autoFocus
          />
          {error && <p className="apikey-error">{error}</p>}

          <button className="apikey-btn" onClick={handleSaveManual} disabled={!key.trim()}>
            Save & Continue
          </button>
          <p className="apikey-hint">Get your key at <span className="apikey-link">console.anthropic.com</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="apikey-overlay">
      <div className="apikey-card">
        <div className="apikey-card__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="apikey-card__title">Connect to Anthropic</h2>
        <p className="apikey-card__desc">
          Choose how Labonair should authenticate with the Claude API.
        </p>

        <button className="apikey-option" onClick={handleUseClaudeCode}>
          <div className="apikey-option__icon apikey-option__icon--primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="apikey-option__text">
            <span className="apikey-option__title">Use Claude Code login</span>
            <span className="apikey-option__desc">Import credentials from your existing Claude Code installation — no key needed.</span>
          </div>
          <svg className="apikey-option__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div className="apikey-divider"><span>or</span></div>

        <button className="apikey-option apikey-option--secondary" onClick={() => setScreen('manual')}>
          <div className="apikey-option__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <div className="apikey-option__text">
            <span className="apikey-option__title">Enter API Key manually</span>
            <span className="apikey-option__desc">Use a custom Anthropic API key stored in the OS keychain.</span>
          </div>
          <svg className="apikey-option__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
