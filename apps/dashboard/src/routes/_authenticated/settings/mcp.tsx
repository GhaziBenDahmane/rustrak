import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { getMcpSettings, listConnections } from '@/features/mcp/api/queries';
import { ConnectedApps } from '@/features/mcp/ui/components/connected-apps';
import { McpSettings } from '@/features/mcp/ui/components/mcp-settings';
import { translator } from '@/shared/i18n/intl';
import { LoadFailure } from '@/shared/ui/components/load-failure';
import { useSessionUser } from '@/shared/ui/hooks/use-session-user';

export const Route = createFileRoute('/_authenticated/settings/mcp')({
  head: () => {
    const t = translator('settings');
    return {
      meta: [
        { title: t('mcp.meta.title') },
        { name: 'description', content: t('mcp.meta.description') },
      ],
    };
  },
  loader: async () => {
    const [settings, connections] = await Promise.all([
      getMcpSettings(),
      listConnections(),
    ]);
    return { settings, connections };
  },
  component: McpPage,
});

function McpPage() {
  const t = useTranslations('settings');
  const { settings, connections } = Route.useLoaderData();
  const user = useSessionUser();

  return (
    <>
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
          {t('mcp.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('mcp.subtitle')}</p>
      </div>

      {settings.success ? (
        <McpSettings initial={settings.data} isAdmin={user.role === 'admin'} />
      ) : (
        <LoadFailure
          error={settings.error}
          title={t('mcp.loadFailed')}
          notFoundOnMissing={false}
        />
      )}

      <div className="mt-6">
        {connections.success ? (
          <ConnectedApps initial={connections.data} />
        ) : (
          <LoadFailure
            error={connections.error}
            title={t('mcp.connected.loadFailed')}
            notFoundOnMissing={false}
          />
        )}
      </div>
    </>
  );
}
