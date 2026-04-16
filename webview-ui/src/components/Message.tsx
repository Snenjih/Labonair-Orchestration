import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import { useEffect, useRef } from 'react';

interface UserMessageProps { text: string }
interface AssistantMessageProps { text: string }

export function UserMessage({ text }: UserMessageProps) {
  return (
    <div className="msg msg--user">
      <span className="msg__bubble">{text}</span>
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
    </div>
  );
}
