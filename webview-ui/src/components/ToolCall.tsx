import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import clsx from 'clsx';

const DIFF_TOOLS = new Set(['Edit', 'Write', 'str_replace_editor', 'str_replace_based_edit_tool']);

function isDiffTool(name: string): boolean {
  return DIFF_TOOLS.has(name);
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  text: string;
}

function parseDiff(args: string | undefined): DiffLine[] | null {
  if (!args) { return null; }
  try {
    const parsed = JSON.parse(args);
    const oldStr: string = parsed.old_str ?? parsed.old_string ?? '';
    const newStr: string = parsed.new_str ?? parsed.new_string ?? parsed.new_content ?? parsed.content ?? '';
    if (!oldStr && !newStr) { return null; }
    const lines: DiffLine[] = [];
    if (oldStr) {
      for (const l of oldStr.split('\n')) { lines.push({ type: 'removed', text: l }); }
    }
    if (newStr) {
      for (const l of newStr.split('\n')) { lines.push({ type: 'added', text: l }); }
    }
    return lines;
  } catch {
    return null;
  }
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-view">
      {lines.map((line, i) => (
        <div key={i} className={`diff-line diff-line--${line.type}`}>
          <span className="diff-line__sign">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
          </span>
          <span className="diff-line__text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}

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

  const diffLines = isDiffTool(toolName) ? parseDiff(args) : null;

  return (
    <div className={clsx('tool', endStatus && `tool--${endStatus}`)}>
      <button className="tool__header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Wrench size={14} className="tool__icon" />
        <span className="tool__name">{toolName}</span>
        {args && !diffLines && <code className="tool__args">{args}</code>}
        <span className="tool__spacer" />
        {StatusIcon}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="tool__body">
          {diffLines ? <DiffView lines={diffLines} /> : <pre><code>{output ?? '(running…)'}</code></pre>}
        </div>
      )}
    </div>
  );
}
