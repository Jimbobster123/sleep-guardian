interface TimeBudgetBarProps {
  totalMinutes: number;
  usedMinutes: number;
  bedtimeShift?: string;
}

const TimeBudgetBar = ({ totalMinutes, usedMinutes, bedtimeShift }: TimeBudgetBarProps) => {
  const pct = Math.min((usedMinutes / totalMinutes) * 100, 100);
  const overBudget = usedMinutes > totalMinutes;

  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-foreground">Today's Time Budget</span>
        <span className="text-xs text-muted-foreground">
          {Math.floor(usedMinutes / 60)}h {usedMinutes % 60}m / {Math.floor(totalMinutes / 60)}h
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            overBudget ? 'bg-warning' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {bedtimeShift && (
        <p className="text-xs mt-2 text-warning-foreground bg-warning-light rounded-lg px-3 py-2">
          ⚠️ {bedtimeShift}
        </p>
      )}
    </div>
  );
};

export default TimeBudgetBar;
