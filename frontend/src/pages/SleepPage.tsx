import PageHeader from '@/components/PageHeader';
import SleepGauge from '@/components/SleepGauge';
import ConsistencyScoreCard from '@/components/ConsistencyScoreCard';
import SleepInsightCard from '@/components/SleepInsightCard';
import { useApp } from '@/contexts/AppContext';
import nightSky from '@/assets/night-sky-header.jpg';

const SleepPage = () => {
  const { currentSleepHours, sleepGoal, consistencyScore, crisisMode } = useApp();

  const weekData = [5, -10, 30, -5, 60, 45, 10]; // deviation in minutes from target bedtime

  return (
    <div>
      <PageHeader title="Sleep" compact />

      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Sleep Gauge */}
        <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50 flex flex-col items-center">
          <div className="relative">
            <SleepGauge hours={currentSleepHours} goal={sleepGoal} size={180} />
          </div>
          <p className="text-sm font-medium text-foreground mt-2">07:00–11:00PM</p>
          <div className="flex items-center gap-6 mt-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Average</p>
              <p className="text-lg font-display font-bold text-foreground">6.75 <span className="text-xs font-normal text-muted-foreground">hours</span></p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Jan 30 – Feb 5</p>
              <div className="flex items-end gap-0.5 mt-1 justify-center">
                {[5.5, 7, 8, 6, 4.5, 7.5, 8.5].map((h, i) => (
                  <div
                    key={i}
                    className={`w-3 rounded-sm ${h >= 7 ? 'bg-accent' : h >= 5 ? 'bg-warning' : 'bg-destructive/60'}`}
                    style={{ height: `${(h / 9) * 32}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {crisisMode && (
          <div className="bg-crisis-light border border-crisis/20 rounded-xl p-4">
            <p className="text-sm font-medium text-crisis mb-2">⚡ Crisis Recovery Tips</p>
            <div className="space-y-2 text-xs text-foreground">
              <p>💤 20-min power nap: between 1–3 PM</p>
              <p>🔄 90-min sleep cycle: if you can only sleep short, aim for 1.5h or 3h</p>
              <p>🎯 Streak penalties relaxed during crisis mode</p>
            </div>
          </div>
        )}

        {/* Sleep Insights Banner */}
        <div className="relative rounded-xl overflow-hidden h-24">
          <img src={nightSky} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 night-gradient opacity-70" />
          <div className="absolute inset-0 flex items-center justify-center">
            <h2 className="text-xl font-display font-semibold text-primary-foreground italic">Sleep Insights</h2>
          </div>
        </div>

        {/* Consistency Score */}
        <ConsistencyScoreCard score={consistencyScore} weekData={weekData} />

        {/* Personal Insights */}
        <SleepInsightCard
          title="Tuesday Impact"
          description="On Tuesday you slept 4h → task completion dropped 40%. Your IS 455 assignment took 2x longer than usual."
          personal
        />

        <SleepInsightCard
          title="Optimal Sleep Range"
          description="Around 7–9 hours of sleep per night is linked with the best academic performance for most students."
          actionLabel="Go to Calendar"
        />

        <SleepInsightCard
          title="Sleep Builds Memory"
          description="During sleep, your brain consolidates what you studied, helping you remember and apply information later."
          actionLabel="Go to Calendar"
        />

        <SleepInsightCard
          title="Caffeine Curfew"
          description="Caffeine later in the day can make it harder to fall asleep and stay asleep, even if you don't feel 'wired.'"
          actionLabel="Go to Calendar"
        />
      </div>
    </div>
  );
};

export default SleepPage;
