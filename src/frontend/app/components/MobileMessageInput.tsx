import { useRef, useState, useEffect } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export function MobileMessageInput({ onSend, disabled, readOnly }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  // Track visual viewport so the input stays above the keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) { return; }
    const handler = () => setViewportHeight(vv.height);
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || readOnly) { return; }
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Voice input
  const startVoice = () => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { return; }
    const recognition = new SR();
    recognition.lang = navigator.language;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      setText(prev => prev + transcript);
    };
    recognition.start();
  };

  const hasSR = !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );

  if (readOnly) {
    return (
      <div style={{
        padding: '10px 16px',
        background: '#1e1e32',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        textAlign: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
      }}>
        Read-only mode — viewing only
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px',
      background: '#1e1e32', borderTop: '1px solid rgba(255,255,255,0.07)',
      paddingBottom: `max(10px, calc(10px + env(safe-area-inset-bottom)))`,
    }}>
      {hasSR && (
        <button
          onClick={startVoice}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16,
          }}
          title="Voice input"
        >🎤</button>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Claude is working…' : 'Message Claude…'}
        rows={1}
        style={{
          flex: 1, background: 'rgba(255,255,255,0.06)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '9px 12px', fontSize: 15, fontFamily: 'inherit',
          outline: 'none', resize: 'none', lineHeight: 1.4,
          minHeight: 36, maxHeight: 120,
          opacity: disabled ? 0.5 : 1,
        }}
      />

      <button
        onClick={submit}
        disabled={!text.trim() || disabled}
        style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: text.trim() && !disabled ? '#0e639c' : 'rgba(255,255,255,0.08)',
          color: text.trim() && !disabled ? '#fff' : 'rgba(255,255,255,0.3)',
          cursor: text.trim() && !disabled ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 18, transition: 'background 0.15s',
        }}
      >
        ↑
      </button>
    </div>
  );
}
