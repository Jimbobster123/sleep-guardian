interface ConsistencyScoreCardProps {
  score: number;
  weekData: number[]; // 7 values representing bedtime deviation in minutes
}

const ConsistencyScoreCard = ({ score, weekData }: ConsistencyScoreCardProps) => {
  const maxDev = Math.max(...weekData.map(Math.abs), 60);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">Consistency Score</p>
          <p className="text-xs text-muted-foreground">Bedtime regularity this week</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-2xl font-display font-bold text-consistency">{score}%</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {weekData.map((dev, i) => {
          const h = Math.max((Math.abs(dev) / maxDev) * 100, 8);
          const late = dev > 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-sm transition-all ${
                  Math.abs(dev) < 15
                    ? 'bg-wake'
                    : Math.abs(dev) < 45
                    ? 'bg-warning'
                    : 'bg-destructive/60'
                }`}
                style={{ height: `${h}%` }}
              />
              <span className="text-[9px] text-muted-foreground">{days[i]}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {score >= 80 ? '🎯 Great rhythm! Consistent bedtimes reduce fatigue.' :
         score >= 60 ? '📊 Some variation — try anchoring your weekend bedtime.' :
         '💡 Irregular bedtimes may explain tiredness even after long sleep.'}
      </p>
    </div>
  );
};

export default ConsistencyScoreCard;
