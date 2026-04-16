import { useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from 'react';
import { vscode } from '../utils/vscode';

const MENTION_RE = /(?:^|\s)@([^\s]*)$/;
const MAX_HEIGHT = 200;

interface Props {
  fileSuggestions: string[];
  onSubmit: (text: string) => void;
}

export default function MessageInput({ fileSuggestions, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [focusedSuggestion, setFocusedSuggestion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset suggestion focus when list changes
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
      const query = match[1];
      setMentionQuery(query);
      vscode.postMessage({ type: 'requestFileSuggestions', query });
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

    // Find where the @token starts (the @ character itself)
    const match = before.match(MENTION_RE);
    if (!match) { return; }
    const atIndex = before.lastIndexOf('@');
    const leadingSpace = atIndex > 0 && /\s/.test(before[atIndex - 1]) ? before[atIndex - 1] : '';
    const newBefore = before.slice(0, atIndex > 0 && leadingSpace ? atIndex - 1 : atIndex)
      + (leadingSpace || '')
      + `"${suggestion}"`;

    setText(newBefore + after);
    setMentionQuery(null);
    setTimeout(() => {
      resizeTextarea();
      el?.focus();
    }, 0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && fileSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSuggestion(i => Math.min(i + 1, fileSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSuggestion(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(fileSuggestions[focusedSuggestion]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSubmit(text);
        setText('');
        setTimeout(resizeTextarea, 0);
      }
    }
  }

  return (
    <div className="input-wrapper">
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
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Message… (@ to mention a file)"
      />
    </div>
  );
}
