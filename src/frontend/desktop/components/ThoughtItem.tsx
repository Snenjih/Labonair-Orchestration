import { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface Props {
  status: 'loading' | 'ready';
  text: string;
}

export default function ThoughtItem({ status, text }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="thought">
      <button
        className="thought__header"
        onClick={() => status === 'ready' && setOpen(o => !o)}
        disabled={status === 'loading'}
        aria-expanded={open}
      >
        <Brain size={14} className="thought__icon" />
        {status === 'loading'
          ? <><Loader2 size={14} className="spin" /><span>Thinking…</span></>
          : <><span>Thought process</span>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</>
        }
      </button>
      {open && status === 'ready' && (
        <div className="thought__body">{text}</div>
      )}
    </div>
  );
}
