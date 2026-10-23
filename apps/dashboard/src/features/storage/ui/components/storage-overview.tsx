import type { CleanupStatus, RetentionResponse } from '@rustrak/client';
import { Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import {
  deletesAnything,
  removedParts,
  runStatus,
  type Summary,
} from '@/features/storage/model/retention';
import { formatBytes } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/components/shadcn/card';

/** Fixed categorical slots, in order: the colour follows the kind. */
const SEGMENTS = [
  { key: 'events', color: 'bg-chart-1' },
  { key: 'transactions', color: 'bg-chart-2' },
  { key: 'logs', color: 'bg-chart-3' },
  { key: 'sourceMaps', color: 'bg-chart-4' },
] as const;

/**
 * How much the instance holds and of what, as one meter, and what the
 * cleanup does next. Each figure appears here and nowhere else.
 */
export function StorageOverview({
  summary,
  retention,
  job,
}: {
  summary: Summary;
  retention: RetentionResponse;
  job: CleanupStatus | null;
}) {
  const t = useTranslations('storage');
  const format = useFormatter();
  const total = Math.max(summary.bytes, 1);
  const bytesOf = (key: (typeof SEGMENTS)[number]['key']) =>
    key === 'sourceMaps' ? summary.sourceMaps.bytes : summary.kinds[key].bytes;
  const detailOf = (key: (typeof SEGMENTS)[number]['key']) =>
    key === 'sourceMaps'
      ? t('overview.files', { count: summary.sourceMaps.files })
      : t('overview.rows', {
          count: summary.kinds[key].rows,
          rows: format.number(summary.kinds[key].rows, 'compact'),
        });

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t('overview.title')}
          </p>
          <p className="mt-1 text-3xl font-bold">
            {formatBytes(summary.bytes)}
          </p>
        </div>
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={SEGMENTS.map(
            (s) => `${t(`kind.${s.key}`)} ${formatBytes(bytesOf(s.key))}`,
          ).join(', ')}
        >
          {SEGMENTS.map((s) =>
            bytesOf(s.key) > 0 ? (
              <div
                key={s.key}
                className={s.color}
                style={{ width: `${(bytesOf(s.key) / total) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="flex gap-2">
              <span
                aria-hidden
                className={`mt-1.5 size-2.5 shrink-0 rounded-sm ${s.color}`}
              />
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t(`kind.${s.key}`)}
                </dt>
                <dd className="text-base font-semibold tabular-nums">
                  {formatBytes(bytesOf(s.key))}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {detailOf(s.key)}
                </dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="border-t pt-3">
          <CleanupLine summary={summary} retention={retention} job={job} />
        </div>
      </CardContent>
    </Card>
  );
}

/** One sentence: what the cleanup does next, or is doing now. */
function CleanupLine({
  summary,
  retention,
  job,
}: {
  summary: Summary;
  retention: RetentionResponse;
  job: CleanupStatus | null;
}) {
  const t = useTranslations('storage');
  const format = useFormatter();

  if (job?.state === 'running' && job.kind === 'compaction') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        {t('overview.compacting')}
      </p>
    );
  }
  // Running here (followed, with progress) or on the schedule.
  if (job?.state === 'running' || retention.last_run?.status === 'running') {
    const parts = job?.state === 'running' ? removedParts(job.removed, t) : [];
    return (
      <p className="flex items-center gap-2 text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        {t('overview.cleaning', {
          parts: parts.length ? parts.join(', ') : t('overview.starting'),
        })}
      </p>
    );
  }
  if (!deletesAnything(retention.settings)) {
    return <p className="text-sm text-muted-foreground">{t('overview.off')}</p>;
  }
  const { last } = runStatus(retention, t);
  const failed = last?.key === 'status.lastRunFailed';
  return (
    <div className="space-y-0.5 text-sm">
      <p>
        {retention.next_run_at
          ? t('overview.next', {
              when: format.relativeTime(new Date(retention.next_run_at)),
              size: formatBytes(summary.frees),
            })
          : t('overview.scheduling')}
      </p>
      {failed && last && (
        <p className="text-destructive">
          {t(last.key, {
            ...last.values,
            when: format.relativeTime(new Date(last.at ?? Date.now())),
          })}
        </p>
      )}
    </div>
  );
}
