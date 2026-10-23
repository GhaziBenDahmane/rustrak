import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { listFeedback } from '@/features/issue/api/queries';
import {
  MAILBOX_FILTER,
  MAILBOXES,
} from '@/features/issue/model/feedback-mailbox';
import { FeedbackList } from '@/features/issue/ui/components/feedback-list';
import { getProject } from '@/features/project/api/queries';
import { translator } from '@/shared/i18n/intl';
import { loadAll } from '@/shared/lib/results';
import { searchOneOf, searchPage } from '@/shared/lib/search-params';
import { LoadFailure } from '@/shared/ui/components/load-failure';

/**
 * User feedback: Sentry's feedback inbox. Every feedback is its own issue of
 * category `feedback`, kept out of the issue list and listed here instead.
 */
export const Route = createFileRoute('/_authenticated/projects/$id/feedback/')({
  validateSearch: (search: Record<string, unknown>) => ({
    mailbox: searchOneOf(search.mailbox, MAILBOXES),
    page: searchPage(search.page),
  }),
  loaderDeps: ({ search }) => ({
    mailbox: search.mailbox ?? 'inbox',
    page: search.page ?? 1,
  }),
  loader: ({ params, deps }) => {
    const projectId = Number.parseInt(params.id, 10);
    return loadAll([
      getProject(projectId),
      listFeedback(projectId, {
        filter: MAILBOX_FILTER[deps.mailbox],
        page: deps.page,
        per_page: 25,
      }),
    ]);
  },
  head: ({ loaderData }) => {
    const t = translator('projectPages');

    if (!loaderData?.success) {
      return { meta: [{ title: t('projectNotFound') }] };
    }

    const [project] = loaderData.data;
    return {
      meta: [
        { title: t('projectTitle', { project: project.name }) },
        {
          name: 'description',
          content: t('feedback.meta.description', { project: project.name }),
        },
      ],
    };
  },
  component: FeedbackPage,
});

function FeedbackPage() {
  const t = useTranslations('projectPages');
  const { id } = Route.useParams();
  const { mailbox, page } = Route.useSearch({
    select: (search) => ({
      mailbox: search.mailbox ?? 'inbox',
      page: search.page ?? 1,
    }),
  });
  const navigate = Route.useNavigate();
  const isPending = useRouterState({ select: (s) => s.status === 'pending' });
  const loaded = Route.useLoaderData();

  if (!loaded.success) {
    return (
      <LoadFailure error={loaded.error} title={t('feedback.loadFailed')} />
    );
  }

  const [project, feedback] = loaded.data;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="shrink-0 w-full px-4 md:px-8 py-4 md:py-6 border-b">
        <h1 className="text-lg font-semibold">{t('feedback.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('feedback.subtitle', { project: project.name })}
        </p>
      </div>

      <div className="flex-1 overflow-hidden w-full px-4 md:px-8 py-4 md:py-6">
        <FeedbackList
          projectId={Number.parseInt(id, 10)}
          feedback={feedback}
          mailbox={mailbox}
          page={page}
          isPending={isPending}
          onMailboxChange={(next) =>
            navigate({ search: { mailbox: next, page: undefined } })
          }
          onPageChange={(next) =>
            navigate({ search: (prev) => ({ ...prev, page: next }) })
          }
        />
      </div>
    </div>
  );
}
