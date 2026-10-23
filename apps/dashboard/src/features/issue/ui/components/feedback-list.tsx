import type { FeedbackListResponse } from '@rustrak/client';
import { MessageSquare } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import {
  MAILBOXES,
  type Mailbox,
} from '@/features/issue/model/feedback-mailbox';
import { Link } from '@/shared/ui/components/link';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/components/shadcn/tabs';
import { TablePagination } from '@/shared/ui/components/table-pagination';

/**
 * One mailbox of a project's feedback. Each row opens the feedback's own
 * issue page, where it is resolved or marked as spam like any issue.
 */
export function FeedbackList({
  projectId,
  feedback,
  mailbox,
  page,
  isPending,
  onMailboxChange,
  onPageChange,
}: {
  projectId: number;
  feedback: FeedbackListResponse;
  mailbox: Mailbox;
  page: number;
  isPending: boolean;
  onMailboxChange: (mailbox: Mailbox) => void;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('projectPages.feedback');
  const format = useFormatter();

  return (
    <div className="flex h-full flex-col">
      <Tabs
        className="mb-4 shrink-0"
        value={mailbox}
        onValueChange={(value) => onMailboxChange(value as Mailbox)}
      >
        <TabsList>
          {MAILBOXES.map((box) => (
            <TabsTrigger key={box} value={box} disabled={isPending}>
              {t(`mailbox.${box}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {feedback.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <MessageSquare className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t('empty.title')}</p>
          <p className="text-sm text-muted-foreground/70">
            {t('empty.description')}
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y rounded-lg border bg-card">
          {feedback.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/projects/${projectId}/issues/${item.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.name || item.contact_email || t('anonymous')}
                    {item.name && item.contact_email && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {item.contact_email}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {item.message}
                  </p>
                  {item.url && (
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground/70">
                      {item.url}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format.relativeTime(new Date(item.created_at))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TablePagination
        currentPage={page}
        totalPages={feedback.total_pages}
        totalCount={feedback.total_count}
        perPage={feedback.per_page}
        disabled={isPending}
        onPageChange={onPageChange}
      />
    </div>
  );
}
