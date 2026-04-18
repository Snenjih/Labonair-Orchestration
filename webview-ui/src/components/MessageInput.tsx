import { useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from 'react';
import { vscode } from '../utils/vscode';

const MENTION_RE = /(?:^|\s)@([^\s]*)$/;
const MAX_HEIGHT = 200;

const MODEL_OPTIONS = [
  { label: 'Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  { label: 'Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Opus 4.7', value: 'claude-opus-4-7' },
];

const EFFORT_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'X-High', value: 'xhigh' },
  { label: 'Max', value: 'max' },
];

interface Props {
  fileSuggestions: string[];
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  isWorking: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedEffort: string;
  onEffortChange: (effort: string) => void;
}

export default function MessageInput({
  fileSuggestions, onSubmit, onInterrupt, isWorking,
  selectedModel, onModelChange,
  selectedEffort, onEffortChange,
}: Props) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [focusedSuggestion, setFocusedSuggestion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setFocusedSuggestion(0); }, [fileSuggestions]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) { return; }
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px';
  }

  function detectMention(value: string, cursorPos: number) {
    const before = value.slice(0, cursorPos);
    const match = before.match(MENTION_RE);
    if (match) {
      setMentionQuery(match[1]);
      vscode.postMessage({ type: 'requestFileSuggestions', query: match[1] });
    } else {
      setMentionQuery(null);
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    resizeTextarea();
    detectMention(value, e.target.selectionStart ?? value.length);
  }

  function applySuggestion(suggestion: string) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const match = before.match(MENTION_RE);
    if (!match) { return; }
    const atIndex = before.lastIndexOf('@');
    const leadingSpace = atIndex > 0 && /\s/.test(before[atIndex - 1]) ? before[atIndex - 1] : '';
    const newBefore = before.slice(0, atIndex > 0 && leadingSpace ? atIndex - 1 : atIndex)
      + (leadingSpace || '')
      + `"${suggestion}"`;
    setText(newBefore + after);
    setMentionQuery(null);
    setTimeout(() => { resizeTextarea(); el?.focus(); }, 0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && fileSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedSuggestion(i => Math.min(i + 1, fileSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedSuggestion(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggestion(fileSuggestions[focusedSuggestion]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSubmit(text.trim());
        setText('');
        setTimeout(resizeTextarea, 0);
      }
    }
  }

  const selectedModelLabel = MODEL_OPTIONS.find(m => m.value === selectedModel)?.label ?? selectedModel;

  return (
    <div className="pill-input-container">
      {mentionQuery !== null && fileSuggestions.length > 0 && (
        <ul className="mention-list">
          {fileSuggestions.map((s, i) => (
            <li
              key={s}
              className={i === focusedSuggestion ? 'focused' : ''}
              onMouseDown={e => { e.preventDefault(); applySuggestion(s); }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <div className="pill-input">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message the agent, tag @files, or use /commands and /skills"
          className="pill-textarea"
        />

        <div className="pill-controls">
          <div className="pill-left-controls">
            <button className="pill-icon-btn" title="Attach file" aria-label="Attach file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            <div className="pill-model-selector">
              <select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value)}
                className="pill-select"
                aria-label="Model"
              >
                {MODEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="pill-select-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                </svg>
                {selectedModelLabel}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </span>
            </div>

            <div className="pill-effort-selector">
              <select
                value={selectedEffort}
                onChange={e => onEffortChange(e.target.value)}
                className="pill-select"
                aria-label="Effort"
              >
                {EFFORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="pill-select-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                {EFFORT_OPTIONS.find(e => e.value === selectedEffort)?.label ?? 'Medium'}
              </span>
            </div>
          </div>

          <div className="pill-right-controls">
            <button className="pill-icon-btn" title="Voice input" aria-label="Voice input">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </button>
            {isWorking ? (
              <button className="pill-stop-btn" title="Stop (Interrupt)" aria-label="Stop" onClick={onInterrupt}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                </svg>
              </button>
            ) : (
              <button className="pill-send-btn" title="Send (Enter)" aria-label="Send" onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(''); setTimeout(resizeTextarea, 0); } }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
