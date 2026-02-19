import { useApp } from '@/contexts/AppContext';

const moods = [
  { emoji: '😴', label: 'Exhausted' },
  { emoji: '😐', label: 'Meh' },
  { emoji: '🙂', label: 'Okay' },
  { emoji: '😊', label: 'Good' },
  { emoji: '⚡', label: 'Great' },
];

const EmotionalCheckIn = () => {
  const { emotionalCheckIn, setEmotionalCheckIn } = useApp();

  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
      <p className="text-sm font-medium text-foreground mb-3">How do you feel right now?</p>
      <div className="flex justify-between">
        {moods.map(({ emoji, label }) => (
          <button
            key={label}
            onClick={() => setEmotionalCheckIn(label)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              emotionalCheckIn === label
                ? 'bg-accent/10 scale-110'
                : 'hover:bg-muted'
            }`}
          >
            <span className="text-2xl">{emoji}</span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>
      {emotionalCheckIn && (
        <p className="text-xs text-muted-foreground mt-3 text-center animate-fade-in">
          {emotionalCheckIn === 'Exhausted' && 'Your sleep data shows 4.5h last night — that tracks. Consider a 20min nap today.'}
          {emotionalCheckIn === 'Meh' && 'You slept 6.75h — close but not quite. A consistent bedtime tonight could help.'}
          {emotionalCheckIn === 'Okay' && 'Feeling okay is a good baseline. Let\'s protect tonight\'s sleep to build on this.'}
          {emotionalCheckIn === 'Good' && 'Nice! Your 14-day streak is paying off. Keep it going tonight.'}
          {emotionalCheckIn === 'Great' && 'Awesome! Your consistency score is 78% — that steady rhythm is working.'}
        </p>
      )}
    </div>
  );
};

export default EmotionalCheckIn;
