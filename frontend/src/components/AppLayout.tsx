import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CheckSquare, CalendarDays, Moon, User, ClipboardList } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSleepCheckIn } from '@/contexts/SleepCheckInContext';

const tabs = [
  { path: '/home', icon: Home, label: 'Home' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/sleep', icon: Moon, label: 'Sleep' },
  { path: '/profile', icon: User, label: 'Profile' },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { crisisMode } = useApp();
  const { token } = useAuth();
  const { openModal: openSleepLog } = useSleepCheckIn();
  const hideNav =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/signup') ||
    location.pathname.startsWith('/onboarding');

  return (
    <div className="min-h-screen bg-background luna-app-shell">
      {/* Top navigation */}
      {!hideNav && (
        <header className="sticky top-0 z-50 border-b border-border/60 bg-header/90 backdrop-blur-md shadow-sm">
          <div
            className="h-0.5 w-full bg-gradient-to-r from-sleep/30 via-accent/25 to-consistency/30"
            aria-hidden
          />
          <div className="mx-auto w-full max-w-md md:max-w-5xl pl-2 pr-4 md:pl-3 md:pr-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Go to Home"
              >
                <Moon className="h-5 w-5 shrink-0 text-sleep" aria-hidden />
                <div className="font-display text-2xl font-semibold leading-none text-foreground">
                  Luna
                </div>
              </button>

              <nav className="flex flex-wrap items-center justify-end gap-1" aria-label="Main">
                {tabs.map(({ path, icon: Icon, label }) => {
                  const active = location.pathname === path;
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => navigate(path)}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-w-0 md:px-3 ${
                        active
                          ? 'bg-accent/15 text-accent shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="hidden text-sm font-medium md:inline">{label}</span>
                    </button>
                  );
                })}
                {token ? (
                  <button
                    type="button"
                    onClick={() => openSleepLog()}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-w-0 md:px-3"
                    aria-label="Today's sleep log"
                    title="Today's sleep log"
                  >
                    <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="hidden text-sm font-medium md:inline">Log</span>
                  </button>
                ) : null}
              </nav>
            </div>
          </div>
        </header>
      )}

      {hideNav ? (
        <main className="no-scrollbar overflow-y-auto">
          {children}
        </main>
      ) : (
        <div className="mx-auto w-full max-w-md md:max-w-5xl px-4 md:px-6">
          {crisisMode && (
            <div className="bg-crisis-light border-b border-crisis/20 px-4 py-2 text-center md:rounded-b-xl md:mx-0">
              <span className="text-sm font-medium text-crisis">⚡ Crisis Mode Active — Focus on strategic recovery</span>
            </div>
          )}
          <main className="pt-4 pb-6 no-scrollbar overflow-y-auto">
            {children}
          </main>
        </div>
      )}
    </div>
  );
};

export default AppLayout;
