/** Task is incomplete and due datetime is strictly before now. */
export function isTaskPastDue(status: string | undefined, dueDatetime: string | null | undefined): boolean {
  if (status === 'completed') return false;
  if (!dueDatetime || !String(dueDatetime).trim()) return false;
  const raw = String(dueDatetime).includes('T') ? dueDatetime : String(dueDatetime).replace(' ', 'T');
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}
