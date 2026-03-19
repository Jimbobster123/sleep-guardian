import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

// Common timezones with human-readable labels (IANA identifiers for backend/calendar)
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Select timezone" },
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
  { value: "America/Edmonton", label: "Mountain Time (Edmonton)" },
  { value: "America/Winnipeg", label: "Central Time (Winnipeg)" },
  { value: "America/Halifax", label: "Atlantic Time (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland Time" },
  { value: "America/Mexico_City", label: "Central Mexico (Mexico City)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "America/Buenos_Aires", label: "Buenos Aires" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Amsterdam", label: "Amsterdam" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Europe/Rome", label: "Rome" },
  { value: "Europe/Stockholm", label: "Stockholm" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India (Mumbai, Delhi)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Seoul", label: "Seoul" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Australia/Adelaide", label: "Adelaide" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Australia/Melbourne", label: "Melbourne" },
  { value: "Pacific/Auckland", label: "Auckland" },
  { value: "Africa/Cairo", label: "Cairo" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "UTC", label: "UTC" },
];

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup({ email, password, firstName, lastName, timezone });
      nav("/onboarding/sleep-goal", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-card border border-border/50 shadow-sm rounded-2xl p-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground mt-1">Then set your sleep goal and calendar.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="first">First name</Label>
              <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last">Last name</Label>
              <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tz">Timezone (optional)</Label>
            <select
              id="tz"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Creating..." : "Create account"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground mt-4">
          Already have an account? <Link className="text-accent hover:underline" to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

