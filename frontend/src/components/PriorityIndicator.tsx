import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { priorityFilledSegments, priorityTitle } from '@/lib/taskPriority';

type Props = {
  priority?: number | null;
  /** Smaller stars for dense layouts (e.g. calendar week cells) */
  compact?: boolean;
  className?: string;
};

/**
 * Filled stars only (no empty outlines): high → 3 stars, low → 1 star.
 */
export default function PriorityIndicator({ priority, compact, className }: Props) {
  const n = priorityFilledSegments(priority);
  const title = priorityTitle(priority);
  const size = compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';

  return (
    <span
      className={cn('inline-flex items-center gap-px flex-shrink-0 text-warning', className)}
      title={title}
      aria-label={title}
    >
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className={cn(size, 'fill-warning text-warning')} aria-hidden />
      ))}
    </span>
  );
}
