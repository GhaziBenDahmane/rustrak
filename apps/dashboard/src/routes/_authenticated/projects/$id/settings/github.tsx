import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import {
  getProjectRepository,
  listRepositories,
} from '@/features/github/api/queries';
import { RepositorySettings } from '@/features/github/ui/components/repository-settings';
import { getProject } from '@/features/project/api/queries';
import { translator } from '@/shared/i18n/intl';
import { loadAll } from '@/shared/lib/results';
import { LoadFailure } from '@/shared/ui/components/load-failure';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/settings/github',
)({
  head: () => ({
    meta: [{ title: translator('github')('repository.metaTitle') }],
  }),
  loader: async ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    // The repository list is rendered in both branches: its failure is how
    // the page says GitHub is not connected yet.
    const [loaded, repositories] = await Promise.all([
      loadAll([getProject(projectId), getProjectRepository(projectId)]),
      listRepositories(projectId),
    ]);
    return { loaded, repositories };
  },
  component: GitHubSettingsPage,
});

function GitHubSettingsPage() {
  const t = useTranslations('github');
  const { loaded, repositories } = Route.useLoaderData();

  if (!loaded.success) {
    return (
      <LoadFailure error={loaded.error} title={t('repository.loadFailed')} />
    );
  }
  const [project, repository] = loaded.data;

  return (
    <>
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
          GitHub
        </h1>
        <p className="text-muted-foreground mt-1">{t('repository.subtitle')}</p>
      </div>
      <RepositorySettings
        // A new repository starts from its own saved mappings.
        key={repository?.repo_full_name ?? 'none'}
        projectId={project.id}
        repository={repository}
        repositories={repositories}
      />
    </>
  );
}
