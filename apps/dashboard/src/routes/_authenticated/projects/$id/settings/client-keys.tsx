import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { getProject } from '@/features/project/api/queries';
import { ClientKeysSettings } from '@/features/project/ui/components/client-keys-settings';
import { translator } from '@/shared/i18n/intl';
import { LoadFailure } from '@/shared/ui/components/load-failure';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/settings/client-keys',
)({
  head: () => ({
    meta: [{ title: translator('settings')('clientKeys.meta.title') }],
  }),
  loader: ({ params }) => getProject(Number.parseInt(params.id, 10)),
  component: ClientKeysPage,
});

function ClientKeysPage() {
  const t = useTranslations('settings');
  const project = Route.useLoaderData();

  if (!project.success) {
    return <LoadFailure error={project.error} title={t('loadProjectFailed')} />;
  }

  return (
    <>
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
          {t('clientKeys.title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('clientKeys.subtitle')}</p>
      </div>

      <ClientKeysSettings project={project.data} />
    </>
  );
}
