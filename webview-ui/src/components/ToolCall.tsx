import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  toolName: string;
  args?: string;
  output?: string;
  endStatus?: 'completed' | 'failed' | null;
}

export default function ToolCall({ toolName, args, output, endStatus }: Props) {
  const [open, setOpen] = useState(false);

  const StatusIcon = endStatus === 'completed'
    ? <CheckCircle2 size={14} className="tool__status tool__status--ok" />
    : endStatus === 'failed'
      ? <XCircle size={14} className="tool__status tool__status--err" />
      : <Loader2 size={14} className="tool__status spin" />;

  return (
    <div className={clsx('tool', endStatus && `tool--${endStatus}`)}>
      <button className="tool__header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Wrench size={14} className="tool__icon" />
        <span className="tool__name">{toolName}</span>
        {args && <code className="tool__args">{args}</code>}
        <span className="tool__spacer" />
        {StatusIcon}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="tool__body">
          <pre><code>{output ?? '(running…)'}</code></pre>
        </div>
      )}
    </div>
  );
}
