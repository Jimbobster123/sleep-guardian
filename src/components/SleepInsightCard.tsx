import { Info } from 'lucide-react';

interface SleepInsightCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  personal?: boolean;
}

const SleepInsightCard = ({ title, description, actionLabel, personal }: SleepInsightCardProps) => {
  return (
    <div className={`rounded-xl p-4 border ${
      personal ? 'bg-accent/5 border-accent/20' : 'bg-card border-border/50'
    } shadow-sm`}>
      <div className="flex gap-3">
        <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${personal ? 'text-accent' : 'text-muted-foreground'}`} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          {actionLabel && (
            <button className="text-xs font-medium text-accent mt-2 border border-accent/30 rounded-md px-3 py-1.5 hover:bg-accent/5 transition-colors">
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SleepInsightCard;
