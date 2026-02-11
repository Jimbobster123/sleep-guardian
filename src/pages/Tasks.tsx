import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import TimeBudgetBar from '@/components/TimeBudgetBar';
import { Plus } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const Tasks = () => {
  const { crisisMode } = useApp();

  return (
    <div>
      <PageHeader title="Tasks" compact />

      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Time Budget */}
        <TimeBudgetBar
          totalMinutes={480}
          usedMinutes={375}
          bedtimeShift="If you complete all tasks today, your bedtime shifts to 1:40 AM."
        />

        {crisisMode && (
          <div className="bg-crisis-light border border-crisis/20 rounded-xl p-3">
            <p className="text-xs text-crisis font-medium">
              🎯 Crisis Mode: Focus on must-do tasks only. Consider deferring "Other" tasks.
            </p>
          </div>
        )}

        {/* Priority Section */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Priority</h2>
          <TaskItem title="Security Lab" subtitle="IS 414" duration={90} />
          <TaskItem title="Data Preparation" subtitle="IS 455" duration={60} />
          <TaskItem title="Laundry" subtitle="Personal" duration={45} />
        </div>

        {/* Today Section */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Today</h2>
          <TaskItem title="Data Preparation" subtitle="IS 455" duration={60} completed />
          <TaskItem title="Laundry" subtitle="Personal" duration={45} />
          <TaskItem title="Apply for Jobs" subtitle="Personal" duration={30} />
          <TaskItem title="Pre-class Readings" subtitle="Eternal Families" duration={25} />
          <TaskItem title="Go to the gym" subtitle="Personal" duration={60} nearBedtime />
        </div>

        {/* Other Section */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Other</h2>
          <TaskItem title="Hair Cut" subtitle="Personal" duration={30} />
          <TaskItem title="Grocery Shopping" subtitle="Personal" duration={45} />
          <TaskItem title="Finish Book Club Book" subtitle="Personal" duration={40} />
          <TaskItem title="Study for Test" subtitle="IS 401" duration={90} />
          <TaskItem title="Group Project" subtitle="IS 401" duration={120} />
          <TaskItem title="Clean the Apartment" subtitle="Personal" duration={60} />
          <TaskItem title="Personal Essay" subtitle="Eternal Families" duration={45} />
          <TaskItem title="Interview Prep" subtitle="Personal" duration={60} />
        </div>

        {/* FAB */}
        <button className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40">
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default Tasks;
