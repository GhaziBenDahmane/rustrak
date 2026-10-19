import type {
  CleanupCounts,
  CleanupStatus,
  RetentionResponse,
  RetentionSettings,
} from '@rustrak/client';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  previewRetention,
  runRetention,
  updateRetention,
} from '@/features/storage/api/mutations';

/**
 * Retention being edited: the draft, what it would delete (counted as it
 * changes), and saving it, at the next cleanup or now.
 */
export function useRetentionDraft(
  initial: RetentionSettings,
  onDone: (saved: RetentionResponse, job: CleanupStatus | null) => void,
) {
  const t = useTranslations('storage');
  const [draft, setDraft] = useState(initial);
  const [impact, setImpact] = useState<CleanupCounts | null | 'failed'>(null);
  const [attempt, setAttempt] = useState(0);
  const [isPending, startTransition] = useTransition();

  const key = JSON.stringify(draft);
  useEffect(() => {
    let cancelled = false;
    setImpact(null);
    const timer = setTimeout(async () => {
      const result = await previewRetention(JSON.parse(key));
      if (!cancelled) setImpact(result.success ? result.data : 'failed');
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, attempt]);

  // Starts the cleanup the saved settings now enforce; `null` if it could
  // not start, already said with a toast.
  const startCleanup = async (): Promise<CleanupStatus | null> => {
    const job = await runRetention();
    if (job.success) return job.data;
    toast.error(t('toasts.cleanupFailed'), {
      description:
        job.error.kind === 'conflict' ? t('dialog.alreadyRunning') : undefined,
    });
    return null;
  };

  const save = (cleanNow: boolean) =>
    startTransition(async () => {
      const saved = await updateRetention(draft);
      if (!saved.success) {
        toast.error(t('dialog.saveFailed'));
        return;
      }
      if (!cleanNow) toast.success(t('dialog.saved'));
      onDone(saved.data, cleanNow ? await startCleanup() : null);
    });

  const retry = () => setAttempt((a) => a + 1);

  return { draft, setDraft, impact, retry, isPending, save };
}
