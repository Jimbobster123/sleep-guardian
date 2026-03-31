import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

type AdminUserRow = {
  user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  timezone?: string | null;
  is_admin?: boolean;
  created_at?: string | null;
};

type OnboardingOKR = {
  percentage: number;
  numerator_count: number;
  denominator_count: number;
  interval_days: number;
};

function formatCreatedAt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const { token, user, refreshMe } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [onboardingOkr, setOnboardingOkr] = useState<OnboardingOKR | null>(null);
  const [loadingOkr, setLoadingOkr] = useState(true);
  const [okrError, setOkrError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTz, setEditTz] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setUsersError(null);
      const data = await apiJson<AdminUserRow[]>("/api/admin/users", { token });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingOkr(true);
    setOkrError(null);
    const loadOkr = async () => {
      try {
        const data = await apiJson<OnboardingOKR>("/api/okr/onboarding-sleep-goal-reminder-7d", { token });
        if (cancelled) return;
        setOnboardingOkr(data);
        setOkrError(null);
      } catch (err) {
        if (cancelled) return;
        setOkrError(err instanceof Error ? err.message : "Failed to load OKR");
      } finally {
        if (!cancelled) setLoadingOkr(false);
      }
    };
    void loadOkr();
    const intervalId = window.setInterval(() => void loadOkr(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  const openEdit = (u: AdminUserRow) => {
    setEditing(u);
    setEditEmail(u.email || "");
    setEditFirst(u.first_name || "");
    setEditLast(u.last_name || "");
    setEditPhone(u.phone_number || "");
    setEditTz(u.timezone || "");
    setEditAdmin(Boolean(u.is_admin));
    setEditOpen(true);
  };

  const onSaveEdit = async () => {
    if (!token || !editing) return;
    setSaveBusy(true);
    try {
      await apiJson(`/api/admin/users/${editing.user_id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          email: editEmail,
          first_name: editFirst,
          last_name: editLast,
          phone_number: editPhone,
          timezone: editTz,
          is_admin: editAdmin,
        }),
      });
      toast.success("User updated");
      setEditOpen(false);
      await loadUsers();
      if (editing.user_id === user?.user_id) await refreshMe();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setSaveBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!token || !deleteId) return;
    setDeleteBusy(true);
    try {
      await apiJson(`/api/admin/users/${deleteId}`, { method: "DELETE", token });
      toast.success("User deleted");
      setDeleteId(null);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="pb-8">
      <PageHeader title="Admin" compact />

      <div className="space-y-6 px-1">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">OKR: Sleep Setup</h2>
              <p className="text-xs text-muted-foreground">
                Objective: Reduce the burden of managing schedules around sleep
              </p>
              <p className="text-xs text-muted-foreground">Target: 80%</p>
            </div>
            <div className="text-right">
              {loadingOkr || !onboardingOkr ? (
                <p className="text-2xl font-display font-bold text-foreground">—</p>
              ) : (
                <p className="text-2xl font-display font-bold text-foreground">
                  {Math.round(onboardingOkr.percentage)}%
                </p>
              )}
              <p className="text-xs text-muted-foreground">first {onboardingOkr?.interval_days ?? 7} days</p>
            </div>
          </div>
          {okrError ? <p className="text-xs text-red-500 mt-2">{okrError}</p> : null}
          {onboardingOkr ? (
            <p className="text-xs text-muted-foreground mt-2">
              ({onboardingOkr.numerator_count}/{onboardingOkr.denominator_count}) users met the criteria
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">Users</h2>
          {usersError ? <p className="text-sm text-destructive mb-2">{usersError}</p> : null}
          <div className="rounded-xl border border-border/50 overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Timezone</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsers ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No users
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium max-w-[140px] truncate">{u.email}</TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[100px] truncate">
                        {u.phone_number || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{u.timezone || "—"}</TableCell>
                      <TableCell>{u.is_admin ? "Yes" : "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs whitespace-nowrap">
                        {formatCreatedAt(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={u.user_id === user?.user_id}
                          onClick={() => setDeleteId(u.user_id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="adm-email">Email</Label>
              <Input
                id="adm-email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="adm-first">First name</Label>
                <Input id="adm-first" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adm-last">Last name</Label>
                <Input id="adm-last" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adm-phone">Phone</Label>
              <Input id="adm-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adm-tz">Timezone</Label>
              <Input id="adm-tz" value={editTz} onChange={(e) => setEditTz(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="adm-admin"
                checked={editAdmin}
                onCheckedChange={(v) => setEditAdmin(v === true)}
              />
              <Label htmlFor="adm-admin" className="font-normal cursor-pointer">
                Administrator
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSaveEdit()} disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and related data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void onConfirmDelete()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
