import type { UserReport } from '@rustrak/client';
import { useFormatter, useTranslations } from 'use-intl';

/** The feedback users sent about an error issue, newest first. */
export function UserFeedback({ reports }: { reports: UserReport[] }) {
  const t = useTranslations('projectPages.event.feedback');
  const format = useFormatter();
  return (
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
  );
}
