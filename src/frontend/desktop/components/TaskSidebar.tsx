import { X, Circle, Loader2, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

export interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
}

interface Props {
  tasks: TaskItem[];
  open: boolean;
  onClose: () => void;
}

function StatusIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 size={14} className="task-item__icon task-item__icon--done" />;
  }
  if (status === 'in_progress') {
    return <Loader2 size={14} className="task-item__icon task-item__icon--active spin" />;
  }
  return <Circle size={14} className="task-item__icon task-item__icon--pending" />;
}

export default function TaskSidebar({ tasks, open, onClose }: Props) {
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const done = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className={clsx('task-sidebar', open && 'task-sidebar--open')} aria-hidden={!open}>
      <div className="task-sidebar__header">
        <span className="task-sidebar__title">Tasks</span>
        <div className="task-sidebar__stats">
          {inProgress > 0 && <span className="task-stat task-stat--active">{inProgress} active</span>}
          {done > 0 && <span className="task-stat task-stat--done">{done} done</span>}
        </div>
        <button className="task-sidebar__close" onClick={onClose} aria-label="Close task sidebar">
          <X size={14} />
        </button>
      </div>

      <div className="task-sidebar__body">
        {tasks.length === 0 ? (
          <p className="task-sidebar__empty">No tasks yet.</p>
        ) : (
          <ul className="task-list">
            {tasks.map(task => (
              <li key={task.id} className={clsx('task-item', `task-item--${task.status}`)}>
                <StatusIcon status={task.status} />
                <span className="task-item__title">{task.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="task-sidebar__footer">
          {pending + inProgress} remaining · {done} completed
        </div>
      )}
    </div>
  );
}
