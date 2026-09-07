import { createFileRoute, notFound } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { IssueListCard } from '@/features/issue/ui/components/issue-list-card';
import { getProject } from '@/features/project/api/queries';
import {
  getAllReleaseHealthRows,
  getNewIssuesForRelease,
} from '@/features/release/api/queries';
import { ReleaseEnvironmentCards } from '@/features/release/ui/components/release-environment-cards';
import { translator } from '@/shared/i18n/intl';
import { loadAll } from '@/shared/lib/results';
import { searchString } from '@/shared/lib/search-params';
import { LoadFailure } from '@/shared/ui/components/load-failure';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/releases/$release',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    environment: searchString(search.environment),
  }),
  loader: async ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    const releaseVersion = decodeURIComponent(params.release);

    // Started here, awaited below. It is kept *out* of `loadAll` because the
    // page does not need it: the environment cards are the release's real
    // content and stand on their own, so its failure degrades this one panel
    // instead of the page -- and it degrades to a failure, never to "no new
    // issues introduced in this release", which is a statement about the
    // release we did not obtain.
    //
    // Kept out of `loadAll` but not out of the same round-trip: awaiting it
    // after `loadAll` resolved would isolate the failure and serialise the
    // request, when only the first was wanted.
    const newIssuesPromise = getNewIssuesForRelease(
      projectId,
      releaseVersion,
      10,
    );

    const loaded = await loadAll([
      getProject(projectId),
      getAllReleaseHealthRows(projectId, releaseVersion),
    ]);

    if (!loaded.success) {
      // The in-flight request above has no consumer now. Take its rejection so
      // a transport-level failure cannot surface as an unhandled rejection.
      void newIssuesPromise.catch(() => undefined);
      return { loaded, newIssues: null, releaseVersion };
    }

    const newIssues = await newIssuesPromise;

    // No health rows at all means the release in the URL was never reported.
    // Distinct from the failure above, which is why the check stays after it.
    if (loaded.data[1].length === 0) {
      throw notFound();
    }

    return { loaded, newIssues, releaseVersion };
  },
  head: ({ loaderData }) => {
    const t = translator('projectPages');

    if (!loaderData?.loaded.success) {
      return { meta: [{ title: t('projectNotFound') }] };
    }

    const [project] = loaderData.loaded.data;
    return {
      meta: [
        {
          title: t('releaseDetail.meta.title', {
            release: loaderData.releaseVersion,
            project: project.name,
          }),
        },
        {
          name: 'description',
          content: t('releaseDetail.meta.description', {
            release: loaderData.releaseVersion,
          }),
        },
      ],
    };
  },
  component: ReleaseDetailPage,
});

function ReleaseDetailPage() {
  const t = useTranslations('projectPages');
  const { id } = Route.useParams();
  const { environment } = Route.useSearch();
  const { loaded, newIssues, releaseVersion } = Route.useLoaderData();
  const projectId = Number.parseInt(id, 10);

  if (!loaded.success) {
    return (
      <LoadFailure error={loaded.error} title={t('releaseDetail.loadFailed')} />
    );
  }

  const [project, rows] = loaded.data;

  const visibleRows = environment
    ? rows.filter((row) => row.environment === environment)
    : rows;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-auto">
      <div className="shrink-0 w-full px-4 md:px-8 py-4 md:py-6 border-b">
        <h1 className="text-lg font-semibold font-mono">{releaseVersion}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('releaseDetail.subtitle', { project: project.name })}
        </p>
      </div>

      <div className="flex-1 w-full px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4">
        <ReleaseEnvironmentCards rows={visibleRows} />

        {newIssues?.success ? (
          <IssueListCard
            projectId={projectId}
            issues={newIssues.data}
            title={t('releaseDetail.newIssues')}
            emptyMessage={t('releaseDetail.newIssuesEmpty')}
          />
        ) : (
          newIssues && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t('releaseDetail.newIssues')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* A 404 from this endpoint alone is not grounds for replacing
                    a release page that already rendered its health cards. */}
                <LoadFailure
                  error={newIssues.error}
                  title={t('releaseDetail.loadNewIssuesFailed')}
                  notFoundOnMissing={false}
                />
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
