/** 1 = highest (2 stars), 2 = medium (1 star), 3 = low (0 stars). */
export function priorityStarCount(priority: number | null | undefined): 0 | 1 | 2 {
  if (priority == null || priority < 1 || priority > 3) return 0;
  if (priority === 1) return 2;
  if (priority === 2) return 1;
  return 0;
}
