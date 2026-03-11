import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CheckSquare, CalendarDays, Moon, Menu, User } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/sleep', icon: Moon, label: 'Sleep' },
  { path: '/menu', icon: Menu, label: 'Menu' },
  { path: '/profile', icon: User, label: 'Profile' },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { crisisMode } = useApp();
  const hideNav =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/signup') ||
    location.pathname.startsWith('/onboarding');

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md md:max-w-5xl min-h-screen md:flex md:gap-6 md:px-6">
        {/* Desktop sidebar */}
        <aside className={`hidden md:flex md:flex-col md:w-56 md:py-6 ${hideNav ? 'md:hidden' : ''}`}>
          <div className="px-3">
            <div className="text-sm font-display font-semibold text-foreground">Luna</div>
            <div className="text-xs text-muted-foreground">Sleep Guardian</div>
          </div>
          <div className="mt-4 space-y-1 px-2">
            {tabs
              .filter((t) => t.path !== '/menu')
              .map(({ path, icon: Icon, label }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                );
              })}
          </div>
          <div className="mt-auto px-2">
            <button
              onClick={() => navigate('/menu')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <Menu className="w-4 h-4" />
              <span className="text-sm font-medium">Menu</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col relative">
          {crisisMode && !hideNav && (
            <div className="bg-crisis-light border-b border-crisis/20 px-4 py-2 text-center md:rounded-b-xl md:mx-0">
              <span className="text-sm font-medium text-crisis">⚡ Crisis Mode Active — Focus on strategic recovery</span>
            </div>
          )}
          <main className={`flex-1 ${hideNav ? 'pb-0' : 'pb-20 md:pb-6'} no-scrollbar overflow-y-auto`}>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:hidden bg-card border-t border-border z-50">
          <div className="flex items-center justify-around py-2 px-2">
            {tabs
              .filter((t) => t.path !== '/profile')
              .map(({ path, icon: Icon, label }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                      active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{label}</span>
                  </button>
                );
              })}
          </div>
        </nav>
      )}
    </div>
  );
};

export default AppLayout;
