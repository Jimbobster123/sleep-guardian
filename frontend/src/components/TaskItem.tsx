import { Pencil, Star } from 'lucide-react';
import { priorityStarCount } from '@/lib/taskPriority';

interface TaskItemProps {
  title: string;
  subtitle?: string; // notes
  category?: string | null;
  duration?: number; // minutes
  plannedDate?: string; // formatted date string like "Feb 20, 3:00 PM"
  dueDate?: string; // formatted date string like "Feb 20"
  completed?: boolean;
  /** Due date has passed and task is not completed */
  pastDue?: boolean;
  nearBedtime?: boolean;
  onEdit?: () => void;
  taskId?: string;
  /** 1 = highest, 3 = lowest */
  priority?: number;
}

const TaskItem = ({
  title,
  subtitle,
  category,
  duration,
  plannedDate,
  dueDate,
  completed,
  pastDue,
  nearBedtime,
  onEdit,
  taskId,
  priority,
}: TaskItemProps) => {
  const hasMeta = category || subtitle || plannedDate || dueDate;
  const stars = priorityStarCount(priority);
  return (
    <div className={`flex items-center gap-3 py-3 px-1 border-b border-border/50 last:border-0 ${
      nearBedtime ? 'bg-warning-light rounded-lg px-3 -mx-2' : ''
    }`}>
      <input
        type="checkbox"
        checked={completed}
        readOnly
        className="w-4 h-4 rounded border-2 border-muted-foreground/40 accent-accent flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {title}
          </p>
          {stars > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-warning flex-shrink-0"
              title={stars === 2 ? 'High priority' : 'Medium priority'}
            >
              {Array.from({ length: stars }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-warning text-warning" aria-hidden />
              ))}
            </span>
          )}
        </div>
        {hasMeta && (
          <div className="flex items-center gap-2 flex-wrap">
            {category && <p className="text-xs text-muted-foreground">{category}</p>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {plannedDate && <p className="text-xs text-muted-foreground">• Planned: {plannedDate}</p>}
            {dueDate && <p className="text-xs text-muted-foreground">• Due: {dueDate}</p>}
          </div>
        )}
      </div>
      {duration && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          nearBedtime
            ? 'bg-warning/10 text-warning-foreground'
            : 'bg-muted text-muted-foreground'
        }`}>
          {duration}m
        </span>
      )}
      <div className="flex items-center gap-1 flex-shrink-0">
        {pastDue && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-orange-500/35 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
            Late
          </span>
        )}
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default TaskItem;
