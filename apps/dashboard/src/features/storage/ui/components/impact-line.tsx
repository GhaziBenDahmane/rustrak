import { Loader2 } from 'lucide-react';
import { useTranslations } from 'use-intl';

/**
 * What a choice deletes, in one line: still counting, failed to count (with
 * a retry), nothing, or the sentence the caller gives.
 */
export function ImpactLine({
  state,
  sentence,
  nothing,
  onRetry,
}: {
  state: 'counting' | 'failed' | 'ready';
  /** What goes; `null` when nothing does. */
  sentence: string | null;
  nothing: string;
  onRetry: () => void;
}) {
  const t = useTranslations('storage');
  return (
    <p
      className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
      aria-live="polite"
    >
      {state === 'failed' ? (
        <span className="text-destructive">
          {t('dialog.countFailed')}{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={onRetry}
          >
            {t('dialog.retry')}
          </button>
        </span>
      ) : state === 'counting' ? (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('dialog.counting')}
        </span>
      ) : sentence ? (
        sentence
      ) : (
        <span className="text-muted-foreground">{nothing}</span>
      )}
    </p>
  );
}
