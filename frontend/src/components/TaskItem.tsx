import { Pencil } from 'lucide-react';

interface TaskItemProps {
  title: string;
  subtitle: string;
  duration?: number; // minutes
  dueDate?: string; // formatted date string like "Feb 20"
  completed?: boolean;
  nearBedtime?: boolean;
  onEdit?: () => void;
  taskId?: string;
}

const TaskItem = ({ title, subtitle, duration, dueDate, completed, nearBedtime, onEdit, taskId }: TaskItemProps) => {
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
        <p className={`text-sm font-medium ${completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {title}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          {dueDate && <p className="text-xs text-muted-foreground">• {dueDate}</p>}
        </div>
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
      <button 
        onClick={onEdit}
        className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default TaskItem;
