import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { vscode } from '../utils/vscode';

interface Props {
  action: string;
  context: string;
  requestId: string;
  onRespond: (allowed: boolean) => void;
  variant?: 'inline' | 'floating';
}

export default function PermissionRequestCard({ action, context, requestId, onRespond, variant = 'inline' }: Props) {
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  function respond(allowed: boolean) {
    if (allowed && alwaysAllow) {
      vscode.postMessage({ type: 'addTrustedTool', payload: action });
    }
    vscode.postMessage({ type: 'respondToPermission', requestId, allowed });
    onRespond(allowed);
  }

  return (
    <div className={clsx('perm-card', variant === 'floating' && 'perm-card--floating')} role="alert">
      <div className="perm-card__header">
        <ShieldAlert size={18} />
        <span>Permission Required</span>
      </div>
      <p className="perm-card__action"><strong>{action}</strong></p>
      <p className="perm-card__context">{context}</p>
      <label className="perm-card__always-allow">
        <input
          type="checkbox"
          checked={alwaysAllow}
          onChange={e => setAlwaysAllow(e.target.checked)}
        />
        Always allow this tool
      </label>
      <div className="perm-card__actions">
        <button className="btn btn--accept" onClick={() => respond(true)}>Accept</button>
        <button className="btn btn--deny" onClick={() => respond(false)}>Deny</button>
      </div>
    </div>
  );
}
