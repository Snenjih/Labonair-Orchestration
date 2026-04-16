interface Props {
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedEffort: string;
  onEffortChange: (effort: string) => void;
}

const MODEL_OPTIONS = [
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
];

const EFFORT_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'High (Thinking)', value: 'thinking' },
];

export default function AgentFormDropdowns({ selectedModel, onModelChange, selectedEffort, onEffortChange }: Props) {
  return (
    <div className="dropdowns">
      <select value={selectedModel} onChange={e => onModelChange(e.target.value)}>
        {MODEL_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <select value={selectedEffort} onChange={e => onEffortChange(e.target.value)}>
        {EFFORT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
