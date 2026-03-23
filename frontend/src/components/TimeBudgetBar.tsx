interface TimeBudgetBarProps {
  /** Total minutes available today (now → bedtime minus planned events) */
  availableMinutes: number;
  /** Sum of estimated minutes for tasks due today */
  taskMinutesToday: number;
}

const TimeBudgetBar = ({ availableMinutes, taskMinutesToday }: TimeBudgetBarProps) => {
  const overBudget = availableMinutes > 0 && taskMinutesToday > availableMinutes;
  const pct = availableMinutes > 0
    ? Math.min((taskMinutesToday / availableMinutes) * 100, 100)
    : 0;

  const fmt = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-foreground">Today&apos;s Time Budget</span>
        <span className="text-xs text-muted-foreground">
          {fmt(taskMinutesToday)} tasks / {availableMinutes > 0 ? fmt(availableMinutes) : '—'} available
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            overBudget ? 'bg-warning' : 'bg-wake'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {overBudget && (
        <p className="text-xs mt-2 text-warning-foreground bg-warning-light rounded-lg px-3 py-2">
          ⚠️ Tasks today exceed your available time before bedtime. Consider deferring some tasks or adjusting your schedule.
        </p>
      )}
      {availableMinutes > 0 && !overBudget && taskMinutesToday > 0 && (
        <p className="text-xs mt-2 text-muted-foreground">
          ✓ Within your time budget for today
        </p>
      )}
    </div>
  );
};

export default TimeBudgetBar;
