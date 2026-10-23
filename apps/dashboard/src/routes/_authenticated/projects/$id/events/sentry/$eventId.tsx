import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { getEventBySentryId } from '@/features/event/api/queries';
import { LoadFailure } from '@/shared/ui/components/load-failure';

/**
 * An event addressed by the id its SDK reported, as a feedback names the
 * error it was about. Redirects to that event inside its issue.
 *
 * In `beforeLoad`, like the issue page, so the redirect happens before
 * anything paints; the component is only for the failure.
 */
export const Route = createFileRoute(
  '/_authenticated/projects/$id/events/sentry/$eventId',
)({
  beforeLoad: async ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    const event = await getEventBySentryId(projectId, params.eventId);
    if (event.success && event.data.issue_id) {
      throw redirect({
        href: `/projects/${projectId}/issues/${event.data.issue_id}/events/${event.data.id}`,
      });
    }
    return { failure: event.success ? null : event.error };
  },
  component: SentryEventPage,
});

function SentryEventPage() {
  const t = useTranslations('projectPages');
  const { failure } = Route.useRouteContext();

  if (failure) {
    return <LoadFailure error={failure} title={t('event.loadFailed')} />;
  }
  return (
    <p className="p-8 text-sm text-muted-foreground">
      {t('event.feedback.errorNotFound')}
    </p>
  );
}
