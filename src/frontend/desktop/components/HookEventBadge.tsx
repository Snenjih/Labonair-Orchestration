interface Props {
  hookType: string;
  message: string;
}

export default function HookEventBadge({ hookType, message }: Props) {
  return (
    <div className="hook-badge" role="note" aria-label={`Hook: ${hookType}`}>
      <span className="hook-badge__type">{hookType}</span>
      {message && <span className="hook-badge__message">{message}</span>}
    </div>
  );
}
