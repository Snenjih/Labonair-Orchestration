import clsx from 'clsx';

export type ViewMode = 'ui' | 'terminal' | 'split';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'ui', label: 'UI' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'split', label: 'Split' },
];

interface Props {
  mode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
}

export default function ViewToggles({ mode, onChangeViewMode }: Props) {
  return (
    <div className="view-toggles" role="group" aria-label="View mode">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          className={clsx('view-toggle-btn', mode === value && 'view-toggle-btn--active')}
          onClick={() => onChangeViewMode(value)}
          aria-pressed={mode === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
