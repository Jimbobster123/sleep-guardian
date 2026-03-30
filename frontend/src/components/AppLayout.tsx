import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CheckSquare, CalendarDays, Moon, User } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

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
  const hideNav =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/signup') ||
    location.pathname.startsWith('/onboarding');

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation */}
      {!hideNav && (
        <header className="sticky top-0 z-50 bg-header/95 backdrop-blur border-b border-border/50">
          <div className="mx-auto w-full max-w-md md:max-w-5xl pl-2 pr-4 md:pl-3 md:pr-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => navigate('/home')}
                className="flex items-center gap-2"
                aria-label="Go to Home"
              >
                <Moon className="w-5 h-5 text-sleep" />
                <div className="font-display font-semibold text-2xl text-foreground leading-none">Luna</div>
              </button>

              <nav className="flex items-center gap-1">
                {tabs.map(({ path, icon: Icon, label }) => {
                  // We'll show all tabs inline (including Menu) so the hamburger isn't needed in PageHeader.
                  const active = location.pathname === path;
                  return (
                    <button
                      key={path}
                      onClick={() => navigate(path)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="w-4 h-4" />
                      {/* Small screens: show icon-only to avoid wrapping/scrolling. */}
                      <span className="text-sm font-medium hidden md:inline">{label}</span>
                    </button>
                  );
                })}
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
