import { useNavigate } from "react-router-dom";
import { Moon, Flame, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Moon, label: "Track your sleep" },
  { icon: Flame, label: "Build consistency" },
  { icon: Bell, label: "Smart reminders" },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="night-gradient w-screen min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12 animate-fade-in-up">
        <Moon className="w-8 h-8 text-white" />
        <span className="font-display font-semibold text-4xl text-white leading-none">Luna</span>
      </div>

      {/* Headline */}
      <div className="text-center max-w-sm animate-fade-in-up animate-fade-in-delay">
        <h1 className="font-display font-semibold text-4xl md:text-5xl text-white leading-tight">
          Sleep better.<br />Wake stronger.
        </h1>
        <p className="mt-4 text-base text-white/70 leading-relaxed">
          Luna helps you protect your sleep window, build healthy habits, and wake up feeling your best — every single day.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 mt-10 animate-fade-in-up animate-fade-in-delay-2">
        {features.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm"
          >
            <Icon className="w-3.5 h-3.5 text-white/80" />
            <span className="text-sm text-white/80 font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 mt-12 w-full max-w-xs sm:max-w-sm animate-fade-in-up animate-fade-in-delay-2">
        <Button
          className="flex-1 bg-white text-sleep hover:bg-white/90 font-semibold h-11"
          onClick={() => navigate("/signup")}
        >
          Create an account
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-white/40 text-white hover:bg-white/10 hover:text-white bg-transparent h-11"
          onClick={() => navigate("/login")}
        >
          Log in
        </Button>
      </div>
    </div>
  );
}
