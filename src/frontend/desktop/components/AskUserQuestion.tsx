import { MessageCircleQuestion } from 'lucide-react';

interface Props {
  question: string;
  options: string[];
  requestId: string;
  onRespond: (answer: string) => void;
}

export default function AskUserQuestion({ question, options, onRespond }: Props) {
  return (
    <div className="ask-card perm-card--floating" role="dialog" aria-label="Claude is asking a question">
      <div className="ask-card__header">
        <MessageCircleQuestion size={18} />
        <span>Claude asks</span>
      </div>
      <p className="ask-card__question">{question}</p>
      {options.length > 0 ? (
        <div className="ask-card__options">
          {options.map((opt, i) => (
            <button key={i} className="ask-card__option" onClick={() => onRespond(opt)}>
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="ask-card__actions">
          <button className="btn btn--accept" onClick={() => onRespond('yes')}>Yes</button>
          <button className="btn btn--deny" onClick={() => onRespond('no')}>No</button>
        </div>
      )}
    </div>
  );
}
