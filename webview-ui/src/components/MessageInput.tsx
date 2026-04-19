import { useEffect, useRef, useState, KeyboardEvent, ChangeEvent, ClipboardEvent, useCallback } from 'react';

const MENTION_RE = /(?:^|\s)@([^\s]*)$/;
const COMMAND_RE = /(?:^|\n|\s)\/([^\s]*)$/;
const MAX_HEIGHT = 600;

interface SlashCommand {
  name: string;
  description: string;
  argumentHint?: string;
  clientOnly?: boolean;
}

interface ImageAttachment {
  id: string;
  dataUrl: string;
  mediaType: string;
  name: string;
}

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
  slashCommands: SlashCommand[];
  onSubmit: (text: string, images?: Array<{ mediaType: string; data: string }>) => void;
  onInterrupt: () => void;
  onClear: () => void;
  onRequestFileSuggestions: (query: string) => void;
  onRequestSlashCommands: () => void;
  isWorking: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedEffort: string;
  onEffortChange: (effort: string) => void;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  contextTokens?: number;
  contextMaxTokens?: number;
}

export default function MessageInput({
  fileSuggestions, slashCommands, onSubmit, onInterrupt, onClear,
  onRequestFileSuggestions, onRequestSlashCommands,
  isWorking, selectedModel, onModelChange, selectedEffort, onEffortChange,
  fastMode = false, onFastModeChange,
  contextTokens = 0, contextMaxTokens = 200000,
}: Props) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [focusedSuggestion, setFocusedSuggestion] = useState(0);
  const [commandQuery, setCommandQuery] = useState<string | null>(null);
  const [focusedCommand, setFocusedCommand] = useState(0);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandsFetchedRef = useRef(false);

  useEffect(() => { setFocusedSuggestion(0); }, [fileSuggestions]);
  useEffect(() => { setFocusedCommand(0); }, [slashCommands, commandQuery]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) { return; }
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px';
  }

  function detectMention(value: string, cursorPos: number) {
    const before = value.slice(0, cursorPos);

    const cmdMatch = before.match(COMMAND_RE);
    if (cmdMatch) {
      const q = cmdMatch[1].toLowerCase();
      setCommandQuery(q);
      setMentionQuery(null);
      if (!commandsFetchedRef.current) {
        commandsFetchedRef.current = true;
        onRequestSlashCommands();
      }
      return;
    }
    setCommandQuery(null);

    const fileMatch = before.match(MENTION_RE);
    if (fileMatch) {
      const q = fileMatch[1];
      setMentionQuery(q);
      onRequestFileSuggestions(q);
    } else {
      setMentionQuery(null);
    }
  }

  const filteredCommands = useCallback(() => {
    if (commandQuery === null) { return []; }
    const q = commandQuery.toLowerCase();
    return slashCommands.filter(c => c.name.startsWith(q));
  }, [commandQuery, slashCommands]);

  function applyCommand(cmd: SlashCommand) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const slashIdx = before.lastIndexOf('/');
    const newBefore = before.slice(0, slashIdx) + '/' + cmd.name;
    setText(newBefore + after);
    setCommandQuery(null);
    setTimeout(() => { resizeTextarea(); el?.focus(); }, 0);
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

  function submitText(value: string) {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) { return; }
    if (trimmed === '/clear') { onClear(); setText(''); setTimeout(resizeTextarea, 0); return; }
    const images = attachments.map(a => ({
      mediaType: a.mediaType,
      data: a.dataUrl.split(',')[1],
    }));
    onSubmit(trimmed, images.length > 0 ? images : undefined);
    setText('');
    setAttachments([]);
    setTimeout(resizeTextarea, 0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const cmds = filteredCommands();
    if (commandQuery !== null && cmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedCommand(i => Math.min(i + 1, cmds.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedCommand(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab') { e.preventDefault(); applyCommand(cmds[focusedCommand]); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyCommand(cmds[focusedCommand]); return; }
      if (e.key === 'Escape') { setCommandQuery(null); return; }
    }
    if (mentionQuery !== null && fileSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedSuggestion(i => Math.min(i + 1, fileSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedSuggestion(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggestion(fileSuggestions[focusedSuggestion]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitText(text);
    }
  }

  function addImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const mediaType = file.type || 'image/png';
      setAttachments(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        dataUrl,
        mediaType,
        name: file.name,
      }]);
    };
    reader.readAsDataURL(file);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) { return; }
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) { addImageFile(file); }
    });
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(f => addImageFile(f));
    e.target.value = '';
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  const selectedModelLabel = MODEL_OPTIONS.find(m => m.value === selectedModel)?.label ?? selectedModel;
  const cmds = filteredCommands();
  const contextPct = contextMaxTokens > 0 ? Math.min(contextTokens / contextMaxTokens, 1) : 0;
  const contextColor = contextTokens === 0 ? 'var(--vscode-foreground)' : contextPct > 0.85 ? '#f14c4c' : contextPct > 0.6 ? '#ffc107' : '#4ec9b0';

  return (
    <div className="pill-input-container">
      {commandQuery !== null && cmds.length > 0 && (
        <ul className="command-list">
          {cmds.map((cmd, i) => (
            <li
              key={cmd.name}
              className={i === focusedCommand ? 'focused' : ''}
              onMouseDown={e => { e.preventDefault(); applyCommand(cmd); }}
            >
              <span className="command-list__name">/{cmd.name}</span>
              {cmd.argumentHint && <span className="command-list__hint">{cmd.argumentHint}</span>}
              <span className="command-list__desc">{cmd.description}</span>
            </li>
          ))}
        </ul>
      )}
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
        {attachments.length > 0 && (
          <div className="pill-attachments">
            {attachments.map(a => (
              <div key={a.id} className="pill-attachment">
                <img src={a.dataUrl} alt={a.name} className="pill-attachment__thumb" />
                <button
                  className="pill-attachment__remove"
                  onMouseDown={e => { e.preventDefault(); removeAttachment(a.id); }}
                  title="Remove"
                >×</button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          placeholder="Message the agent, tag @files, or use /commands"
          className="pill-textarea"
        />

        <div className="pill-controls">
          <div className="pill-left-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            {onFastModeChange && (
              <button
                className={`pill-icon-btn${fastMode ? ' pill-icon-btn--active' : ''}`}
                title={fastMode ? 'Fast Mode: ON (Haiku)' : 'Fast Mode: OFF'}
                aria-label="Toggle Fast Mode"
                onMouseDown={e => { e.preventDefault(); onFastModeChange(!fastMode); }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={fastMode ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </button>
            )}
            <button
              className="pill-icon-btn"
              title="Attach image"
              aria-label="Attach image"
              onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}
            >
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
            <ContextMeter
              tokens={contextTokens}
              maxTokens={contextMaxTokens}
              pct={contextPct}
              color={contextColor}
            />
            {isWorking ? (
              <button className="pill-stop-btn" title="Stop (Interrupt)" aria-label="Stop" onClick={onInterrupt}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                </svg>
              </button>
            ) : (
              <button className="pill-send-btn" title="Send (Enter)" aria-label="Send" onClick={() => submitText(text)}>
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

function ContextMeter({ tokens, maxTokens, pct, color }: { tokens: number; maxTokens: number; pct: number; color: string }) {
  const R = 10;
  const circumference = 2 * Math.PI * R;
  const dash = pct * circumference;
  const remaining = maxTokens - tokens;
  const tooltipText = tokens === 0
    ? `Context window: ${maxTokens.toLocaleString()} tokens available`
    : `Context: ${Math.round(pct * 100)}%\n${tokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens used\n${remaining.toLocaleString()} tokens remaining`;

  return (
    <div className="context-meter" title={tooltipText} aria-label={tooltipText}>
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r={R} fill="none" stroke="currentColor" strokeWidth="2" opacity={pct === 0 ? 0.3 : 0.15} />
        <circle
          cx="12" cy="12" r={R}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
    </div>
  );
}
