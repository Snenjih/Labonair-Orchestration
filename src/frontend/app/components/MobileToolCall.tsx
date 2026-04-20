import { useState } from 'react';
import type { ParsedEvent } from '@shared/types';

interface Props {
  start: ParsedEvent & { type: 'tool_call_start' };
  output?: ParsedEvent & { type: 'tool_call_output' };
  end?: ParsedEvent & { type: 'tool_call_end' };
}

export function MobileToolCall({ start, output, end }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = end?.status === 'completed';
  const isFailed = end?.status === 'failed';
  const isPending = !end;

  const statusColor = isPending ? '#4fc1ff' : isCompleted ? '#4ec9b0' : '#f14c4c';
  const statusIcon = isPending ? '⟳' : isCompleted ? '✓' : '✗';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, marginBottom: 6, overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '8px 10px', border: 'none', background: 'transparent',
          color: 'inherit', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{ color: statusColor, fontSize: 13, flexShrink: 0 }}>{statusIcon}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#e0e0ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {start.toolName}
        </span>
        <span style={{ fontSize: 12, opacity: 0.4 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', fontSize: 11, fontFamily: 'monospace' }}>
          {start.args && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Args</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, wordBreak: 'break-all', maxHeight: 120, overflow: 'hidden' }}>{start.args}</div>
            </div>
          )}
          {output && (
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, wordBreak: 'break-all', maxHeight: 160, overflow: 'hidden' }}>{output.output}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
