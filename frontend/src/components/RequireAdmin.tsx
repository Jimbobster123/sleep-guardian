import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!user.is_admin) nav("/", { replace: true });
  }, [loading, user, nav]);

  if (loading) return null;
  if (!user?.is_admin) return null;
  return <>{children}</>;
}
