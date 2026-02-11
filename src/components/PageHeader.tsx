import { Moon, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import nightSky from '@/assets/night-sky-header.jpg';

interface PageHeaderProps {
  title: string;
  compact?: boolean;
}

const PageHeader = ({ title, compact }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className={`relative overflow-hidden ${compact ? 'h-24' : 'h-36'}`}>
      <img
        src={nightSky}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 night-gradient opacity-60" />
      <div className="relative z-10 flex items-center justify-between px-5 pt-4">
        <Moon className="w-6 h-6 text-primary-foreground opacity-80" />
        <button onClick={() => navigate('/menu')} aria-label="Menu">
          <Menu className="w-6 h-6 text-primary-foreground opacity-80" />
        </button>
      </div>
      <div className="relative z-10 px-5 mt-1">
        <h1 className={`font-display text-primary-foreground font-semibold ${compact ? 'text-2xl' : 'text-3xl'}`}>
          {title}
        </h1>
      </div>
    </div>
  );
};

export default PageHeader;
