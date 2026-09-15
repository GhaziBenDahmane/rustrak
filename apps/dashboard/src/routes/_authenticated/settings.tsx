import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { translator } from '@/shared/i18n/intl';
import { useSessionUser } from '@/shared/ui/hooks/use-session-user';
import { SettingsMobileNav } from './settings/-components/settings-mobile-nav';
import { SettingsNav } from './settings/-components/settings-nav';

export const Route = createFileRoute('/_authenticated/settings')({
  head: () => {
    const t = translator('settings');
    return {
      meta: [
        { title: `${t('nav.settingsTitle')} | Rustrak` },
        { name: 'description', content: t('meta.description') },
      ],
    };
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  const t = useTranslations('settings');
  // The gate above resolved this. It used to be a second `getCurrentUser()`
  // here, and the branch it needed — "we could not ask" is not "you are not an
  // admin" — is now made once, in `_authenticated`, which renders the outage
  // screen rather than this layout with every admin entry silently missing.
  const user = useSessionUser();
  const isAdmin = user.role === 'admin';

  return (
    <div className="w-full">
      {/* Mobile top bar */}
      <div className="sticky top-16 z-40 bg-background flex items-center gap-3 border-b px-4 py-3 md:hidden">
        <SettingsMobileNav isAdmin={isAdmin} />
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {t('nav.settingsTitle')}
        </span>
      </div>

      <div className="flex min-h-[calc(100vh-64px)]">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-border p-6 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 px-3">
            {t('nav.settingsTitle')}
          </h2>
          <SettingsNav isAdmin={isAdmin} />
        </aside>

        {/* Main content */}
        <div className="flex-1 p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
