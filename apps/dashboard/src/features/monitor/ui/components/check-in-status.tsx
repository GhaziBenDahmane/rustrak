import type { CheckInStatus } from '@rustrak/client';
import { useTranslations } from 'use-intl';
import { checkInFill } from '@/features/monitor/lib/check-in-fill';
import { cn } from '@/shared/lib/utils';

/** A status dot and its name, never the colour alone. */
export function CheckInStatusLabel({ status }: { status: CheckInStatus }) {
  const t = useTranslations('crons');
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', checkInFill(status))}
      />
      {t(`status.${status}`)}
    </span>
  );
}
