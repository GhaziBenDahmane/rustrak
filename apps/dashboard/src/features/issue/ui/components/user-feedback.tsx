import type { IssuesListUserReportsResponse } from '@rustrak/client';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import { listUserReports } from '@/features/issue/api/queries';
import { Button } from '@/shared/ui/components/shadcn/button';

/**
 * The feedback users sent about an error issue, newest first: the first page
 * from the route's loader, older pages on request.
 */
export function UserFeedback({
  projectId,
  issueId,
  firstPage,
}: {
  projectId: number;
  issueId: string;
  firstPage: IssuesListUserReportsResponse;
}) {
  const t = useTranslations('projectPages.event.feedback');
  const format = useFormatter();
  const [pages, setPages] = useState([firstPage]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const last = pages[pages.length - 1]!;
  // A report sent while paging shifts the offsets; keep each one once.
  const reports = [
    ...new Map(pages.flatMap((p) => p.items).map((r) => [r.id, r])).values(),
  ];

  async function showOlder() {
    setLoading(true);
    setFailed(false);
    try {
      const next = await listUserReports(projectId, issueId, last.page + 1);
      if (next.success) setPages([...pages, next.data]);
      else setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {reports.map((report) => (
          <li key={report.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium truncate">
                {report.name || t('anonymous')}
              </span>
              {report.email && (
                <a
                  href={`mailto:${report.email}`}
                  className="truncate text-muted-foreground hover:underline"
                >
                  {report.email}
                </a>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {format.relativeTime(new Date(report.created_at))}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {report.comments}
            </p>
          </li>
        ))}
      </ul>

      {last.page < last.total_pages && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={showOlder}
        >
          {t('showOlder', {
            count: Math.max(last.total_count - reports.length, 0),
          })}
        </Button>
      )}
      {failed && (
        <p className="text-xs text-destructive">{t('showOlderFailed')}</p>
      )}
    </div>
  );
}
