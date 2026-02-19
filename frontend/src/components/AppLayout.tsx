import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CheckSquare, CalendarDays, Moon, Menu } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/sleep', icon: Moon, label: 'Sleep' },
  { path: '/menu', icon: Menu, label: 'Menu' },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { crisisMode } = useApp();

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background flex flex-col relative">
      {crisisMode && (
        <div className="bg-crisis-light border-b border-crisis/20 px-4 py-2 text-center">
          <span className="text-sm font-medium text-crisis">
            ⚡ Crisis Mode Active — Focus on strategic recovery
          </span>
        </div>
      )}
      <main className="flex-1 pb-20 no-scrollbar overflow-y-auto">
        {children}
      </main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50">
        <div className="flex items-center justify-around py-2 px-2">
          {tabs.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  active
                    ? 'text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
