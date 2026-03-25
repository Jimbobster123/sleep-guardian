/**
 * Priority stored as 1 = highest, 3 = lowest.
 * Visual: up to 3 stars; high = 3 filled, low = 1 filled.
 */
export function priorityFilledSegments(priority: number | null | undefined): 1 | 2 | 3 {
  const p =
    priority == null || Number.isNaN(Number(priority)) ? 3 : Math.min(3, Math.max(1, Math.round(Number(priority))));
  return (4 - p) as 1 | 2 | 3;
}

export function priorityTitle(priority: number | null | undefined): string {
  const p =
    priority == null || Number.isNaN(Number(priority)) ? 3 : Math.min(3, Math.max(1, Math.round(Number(priority))));
  if (p === 1) return 'High priority';
  if (p === 2) return 'Medium priority';
  return 'Low priority';
}
