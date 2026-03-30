import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { ApiError, apiJson } from "@/lib/api";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the selected image."));
    reader.readAsDataURL(file);
  });
}

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [timezone, setTimezone] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signup({ email, password, firstName, lastName, phoneNumber, timezone });
      if (photoDataUrl) {
        await apiJson("/api/me/profile-photo", {
          method: "PUT",
          token: res.token,
          body: JSON.stringify({ imageDataUrl: photoDataUrl }),
        });
      }
      nav("/onboarding/sleep-goal", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed");
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
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20 border border-border/50">
              {photoDataUrl ? <AvatarImage src={photoDataUrl} alt="Profile preview" /> : null}
              <AvatarFallback className="text-lg font-semibold">
                {(firstName?.[0] || email?.[0] || "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="w-full space-y-1">
              <Label htmlFor="signup-photo">Profile Photo (optional)</Label>
              <Input
                id="signup-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setPhotoDataUrl(null);
                    return;
                  }
                  try {
                    setPhotoDataUrl(await readFileAsDataUrl(file));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to load image.");
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Optional. You can upload or change your profile photo later in settings.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Login uses your email address.</p>
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
            <Label htmlFor="phone">Phone number (optional)</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555 123 4567"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Add a phone number if you want to receive bedtime reminders by text message.
            </p>
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

