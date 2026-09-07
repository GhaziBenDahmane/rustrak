import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { getProject } from '@/features/project/api/queries';
import { listProjectMembers } from '@/features/user/api/queries';
import { MembersSettings } from '@/features/user/ui/components/members-settings';
import { translator } from '@/shared/i18n/intl';
import { loadAll } from '@/shared/lib/results';
import { LoadFailure } from '@/shared/ui/components/load-failure';
import { useSessionUser } from '@/shared/ui/hooks/use-session-user';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/settings/members',
)({
  head: () => ({
    meta: [{ title: translator('settings')('members.meta.title') }],
  }),
  // Each answer still gets its own branch. `listProjectMembers` used to
  // `.catch(() => [])`, so an outage rendered "this project has no members"
  // next to a permission verdict computed from that same empty list.
  loader: ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    return loadAll([getProject(projectId), listProjectMembers(projectId)]);
  },
  component: MembersSettingsPage,
});

function MembersSettingsPage() {
  const t = useTranslations('settings');
  const { id } = Route.useParams();
  const loaded = Route.useLoaderData();
  // The old code fell straight from a `null` user into `canManage: false`, so
  // an API outage silently rendered a read-only members page that looked
  // exactly like the one a non-admin sees. The gate above makes that call once
  // now, and renders the outage screen rather than a plausible demotion.
  const currentUser = useSessionUser();
  const projectId = Number.parseInt(id, 10);

  if (!loaded.success) {
    return <LoadFailure error={loaded.error} title={t('members.loadFailed')} />;
  }

  const [, members] = loaded.data;

  const currentMembership = members.find(
    (member) => member.user_id === currentUser.id,
  );
  const canManageMembers =
    currentUser.role === 'admin' || currentMembership?.role === 'admin';

  return (
    <MembersSettings
      projectId={projectId}
      members={members}
      currentUserId={currentUser.id}
      canManage={canManageMembers}
    />
  );
}
