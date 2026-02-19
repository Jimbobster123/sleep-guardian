interface SleepGaugeProps {
  hours: number;
  goal: number;
  size?: number;
}

const SleepGauge = ({ hours, goal, size = 160 }: SleepGaugeProps) => {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees
  const progress = Math.min(hours / goal, 1);
  const dashOffset = arcLength * (1 - progress);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 100 100" className="transform rotate-[135deg]">
        {/* Background arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        {/* Progress arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          className="gauge-animate transition-all duration-1000"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-4xl font-display font-bold text-foreground">{hours}</span>
        <span className="text-xs text-muted-foreground font-medium">hours</span>
      </div>
    </div>
  );
};

export default SleepGauge;
