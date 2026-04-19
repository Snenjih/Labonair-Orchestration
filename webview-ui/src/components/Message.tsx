import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import { useEffect, useRef, useState, useCallback } from 'react';

interface UserMessageProps { text: string }
interface AssistantMessageProps { text: string }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button className="msg__copy-btn" onClick={handleCopy} title="Copy">
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function UserMessage({ text }: UserMessageProps) {
  return (
    <div className="msg msg--user">
      <div className="msg__row">
        <CopyButton text={text} />
        <span className="msg__bubble">{text}</span>
      </div>
    </div>
  );
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? 'plaintext';

  useEffect(() => {
    if (ref.current) { Prism.highlightElement(ref.current); }
  }, [children]);

  return (
    <pre className={`language-${lang}`}>
      <code ref={ref} className={`language-${lang}`}>
        {String(children).replace(/\n$/, '')}
      </code>
    </pre>
  );
}

export function AssistantMessage({ text }: AssistantMessageProps) {
  return (
    <div className="msg msg--assistant">
      <div className="msg__row msg__row--assistant">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = /language-/.test(className ?? '');
              return isBlock
                ? <CodeBlock className={className}>{children}</CodeBlock>
                : <code className="inline-code" {...props}>{children}</code>;
            }
          }}
        >
          {text}
        </ReactMarkdown>
        <CopyButton text={text} />
      </div>
    </div>
  );
}
