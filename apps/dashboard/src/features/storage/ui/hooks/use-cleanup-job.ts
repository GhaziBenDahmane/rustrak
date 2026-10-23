import type { CleanupCounts, CleanupStatus } from '@rustrak/client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import { getStorageCleanupStatus } from '@/features/storage/api/mutations';
import { elapsed, removedParts } from '@/features/storage/model/retention';

/** How often a running cleanup is asked for its progress. */
const POLL_MS = 2000;

/** One toast per compaction, updated in place while it runs. */
const COMPACTION_TOAST = 'storage-compaction';

/**
 * The server's cleanup job, followed while it runs.
 *
 * A cleanup runs in the background on the server, so the page follows the job
 * instead of waiting on the request that started it. On mount it picks up a
 * cleanup already running (started before a reload, in another tab, or through
 * the MCP). `follow` hands it a job just started. The outcome is announced
 * once, with a toast, and `onSettled` called so the page reads its data again.
 */
export function useCleanupJob(onSettled: () => void) {
  const t = useTranslations('storage');
  const [job, setJob] = useState<CleanupStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorageCleanupStatus().then((status) => {
      if (!cancelled && status.success && status.data.state === 'running') {
        setJob(status.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the page stops the polling, so a compaction's loading toast,
  // which never times out, would stay up for good. Its outcome replaces it
  // in place, so only one still running is taken down.
  const compactingRef = useRef(false);
  compactingRef.current = job?.state === 'running' && job.kind === 'compaction';
  useEffect(
    () => () => {
      if (compactingRef.current) toast.dismiss(COMPACTION_TOAST);
    },
    [],
  );

  // Each answer is a new `job`, which schedules the next ask; a failed ask is
  // retried on the next tick. A chain of timeouts rather than an interval, so
  // a slow answer never overlaps the next one and the outcome is announced
  // once.
  useEffect(() => {
    if (job?.state !== 'running') return;
    // A compaction reports no progress, so its toast stays up with the time
    // it has run, and the outcome replaces it.
    const compacting = job.kind === 'compaction';
    if (compacting) {
      toast.loading(
        t('toasts.compacting', {
          elapsed: elapsed(job.started_at, Date.now()),
        }),
        { id: COMPACTION_TOAST },
      );
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await getStorageCleanupStatus();
      if (cancelled) return;
      if (!status.success) {
        setJob((current) => current && { ...current });
        return;
      }
      setJob(status.data);
      if (status.data.state !== 'running') {
        announce(status.data, t);
        onSettled();
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, onSettled, t]);

  return { job, running: job?.state === 'running', follow: setJob };
}

/** The finished job's toast; a compaction's replaces the one that ran. */
function announce(
  job: CleanupStatus,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const compacting = job.kind === 'compaction';
  const id = compacting ? COMPACTION_TOAST : undefined;
  if (job.state === 'completed') {
    toast.success(
      compacting ? t('toasts.compacted') : summarizeRemoved(job.removed, t),
      { id },
    );
  } else {
    toast.error(
      t(compacting ? 'toasts.compactionFailed' : 'toasts.cleanupFailed'),
      { id, description: job.error ?? undefined },
    );
  }
}

/** Success toast text after a cleanup: what it removed, zeros left out. */
function summarizeRemoved(
  counts: CleanupCounts,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const parts = removedParts(counts, t);
  return parts.length > 0
    ? t('toasts.removed', { parts: parts.join(', ') })
    : t('toasts.nothingRemoved');
}
