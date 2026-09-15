import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { listAlertRules, listIntegrations } from '@/features/alert/api/queries';
import { AlertsSettings } from '@/features/alert/ui/components/alerts-settings';
import { getProject } from '@/features/project/api/queries';
import { translator } from '@/shared/i18n/intl';
import { loadAll } from '@/shared/lib/results';
import { LoadFailure } from '@/shared/ui/components/load-failure';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/settings/alerts',
)({
  head: () => ({
    meta: [{ title: translator('settings')('alerts.meta.title') }],
  }),
  // The two lists used to fall back to `[]`, which drew "no alert rules yet"
  // over an outage and invited the admin to recreate rules that already exist.
  loader: ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    return loadAll([
      getProject(projectId),
      listAlertRules(projectId),
      listIntegrations(),
    ]);
  },
  component: AlertsSettingsPage,
});

function AlertsSettingsPage() {
  const t = useTranslations('settings');
  const loaded = Route.useLoaderData();

  if (!loaded.success) {
    return <LoadFailure error={loaded.error} title={t('alerts.loadFailed')} />;
  }

  const [project, alertRules, channels] = loaded.data;

  return (
    <AlertsSettings
      project={project}
      alertRules={alertRules}
      channels={channels}
    />
  );
}
