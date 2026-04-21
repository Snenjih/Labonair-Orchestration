import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { vscode } from '../utils/vscode';

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

function extractFilePath(args: string | undefined): string | null {
  if (!args) { return null; }
  try {
    const parsed = JSON.parse(args);
    return parsed.file_path ?? parsed.path ?? parsed.filepath ?? null;
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy to clipboard" aria-label="Copy">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
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
  const filePath = extractFilePath(args);
  const fileName = filePath ? filePath.split('/').pop() ?? filePath : null;

  function handleOpenFile(e: React.MouseEvent) {
    e.stopPropagation();
    if (filePath) {
      vscode.postMessage({ type: 'openFile', payload: { path: filePath } });
    }
  }

  return (
    <div className={clsx('tool', endStatus && `tool--${endStatus}`)}>
      <button className="tool__header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Wrench size={14} className="tool__icon" />
        <span className="tool__name">{toolName}</span>
        {fileName && (
          <button className="tool__filepath" onClick={handleOpenFile} title={filePath ?? ''}>
            {fileName}
          </button>
        )}
        {args && !diffLines && !fileName && <code className="tool__args">{args}</code>}
        <span className="tool__spacer" />
        {StatusIcon}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="tool__body">
          {diffLines ? (
            <DiffView lines={diffLines} />
          ) : (
            <>
              {args && (
                <div className="tool__section">
                  <div className="tool__section-header">
                    <span className="tool__section-label">Input</span>
                    <CopyButton text={args} />
                  </div>
                  <pre><code>{args}</code></pre>
                </div>
              )}
              <div className="tool__section">
                <div className="tool__section-header">
                  <span className="tool__section-label">Output</span>
                  {output && <CopyButton text={output} />}
                </div>
                <pre><code>{output ?? '(running…)'}</code></pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
