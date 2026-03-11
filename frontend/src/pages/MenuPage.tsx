import PageHeader from '@/components/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Moon, Sun, Bell, HelpCircle, LogOut, ChevronRight, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const MenuPage = () => {
  const { crisisMode, setCrisisMode } = useApp();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Tasks', path: '/tasks' },
    { label: 'Calendar', path: '/calendar' },
    { label: 'Sleep', path: '/sleep' },
  ];

  const settingsItems = [
    { icon: User, label: 'Profile', onClick: () => navigate('/profile') },
    { icon: Bell, label: 'Notifications' },
    { icon: Moon, label: 'Sleep Settings', onClick: () => navigate('/profile') },
    { icon: Settings, label: 'Preferences' },
    { icon: HelpCircle, label: 'Help & Support' },
  ];

  return (
    <div>
      <PageHeader title="Menu" compact />

      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Quick Nav */}
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          {navItems.map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors"
            >
              <span className="text-lg font-display font-medium text-foreground">{label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Crisis Mode Toggle */}
        <div className={`rounded-xl p-4 border shadow-sm ${crisisMode ? 'bg-crisis-light border-crisis/30 crisis-glow' : 'bg-card border-border/50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${crisisMode ? 'bg-crisis/10' : 'bg-muted'}`}>
                <Zap className={`w-5 h-5 ${crisisMode ? 'text-crisis' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Crisis / Exam Mode</p>
                <p className="text-xs text-muted-foreground">
                  {crisisMode ? 'Active — strategic recovery focus' : 'For exams, deadlines, INTEX weeks'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCrisisMode(!crisisMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                crisisMode ? 'bg-crisis' : 'bg-muted'
              }`}
            >
              <div className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                crisisMode ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {crisisMode && (
            <div className="mt-3 text-xs text-foreground/80 space-y-1">
              <p>• Goal shifts to "mitigate damage"</p>
              <p>• Power nap & 90-min cycle suggestions enabled</p>
              <p>• Streak penalties relaxed</p>
            </div>
          )}
        </div>

        {/* Dark Mode Toggle */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-warning" />
                ) : (
                  <Moon className="w-5 h-5 text-sleep" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">
                  {theme === 'dark' ? 'Night theme active' : 'Switch to night theme'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                theme === 'dark' ? 'bg-accent' : 'bg-muted'
              }`}
            >
              <div className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        {/* Life Event Quick Action */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-sm font-semibold text-foreground mb-2">Quick Adjustments</p>
          <div className="flex gap-2 flex-wrap">
            {['Late social event', 'Early morning class', 'Feeling unwell', 'Weekend reset'].map(label => (
              <button
                key={label}
                className="text-xs bg-muted text-foreground rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-accent transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            The app will adjust intelligently without breaking your streak.
          </p>
        </div>

        {/* Settings */}
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          {settingsItems.map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors"
            >
              <Icon className="w-4.5 h-4.5 text-muted-foreground" />
              <span className="text-sm text-foreground">{label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </button>
          ))}
        </div>

        {/* User */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-accent">
              {(user?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              {(user?.last_name?.[0] || '').toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Your account'}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button onClick={logout} aria-label="Log out">
            <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenuPage;
