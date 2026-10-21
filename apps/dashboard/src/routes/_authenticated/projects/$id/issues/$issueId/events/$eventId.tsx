import type {
  ActivityEntry,
  AttachmentInfo,
  EventDetailResponse,
  IssueAggregates,
  IssueGitHub,
  IssueResponse,
  IssueStatsResponse,
  ProjectRepository,
  UserReport,
} from '@rustrak/client';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import {
  type EventNavigation,
  getEventDetail,
  getEventNavigation,
  listEventAttachments,
} from '@/features/event/api/queries';
import {
  type EventJumpTarget,
  eventJumpTargets,
} from '@/features/event/lib/event-jumps';
import {
  readEventPayload,
  splitIssueTitle,
} from '@/features/event/lib/event-payload';
import {
  getIssueGitHub,
  getProjectRepository,
} from '@/features/github/api/queries';
import { frameSourceUrl } from '@/features/github/lib/source-url';
import {
  getIssue,
  getIssueActivity,
  getIssueAggregates,
  getIssueStats,
  listUserReports,
} from '@/features/issue/api/queries';
import { getProject } from '@/features/project/api/queries';
import { translator } from '@/shared/i18n/intl';
import { CollapsibleRail } from '@/shared/ui/components/collapsible-rail';
import { LoadFailure } from '@/shared/ui/components/load-failure';
import { EventHeader } from './$eventId/-components/event-header';
import { EventIdentityBar } from './$eventId/-components/event-identity-bar';
import { EventLoading } from './$eventId/-components/event-loading';
import { EventRail } from './$eventId/-components/event-rail';
import { EventSections } from './$eventId/-components/event-sections';
import { EventTrends } from './$eventId/-components/event-trends';

export const Route = createFileRoute(
  '/_authenticated/projects/$id/issues/$issueId/events/$eventId',
)({
  loader: async ({ params }) => {
    const projectId = Number.parseInt(params.id, 10);
    const { issueId, eventId } = params;

    const [
      project,
      issue,
      event,
      navigation,
      aggregates,
      stats,
      activity,
      repository,
      code,
      userReports,
      attachments,
    ] = await Promise.all([
      getProject(projectId),
      getIssue(projectId, issueId),
      getEventDetail(projectId, issueId, eventId),
      getEventNavigation(projectId, issueId, eventId),
      getIssueAggregates(projectId, issueId),
      getIssueStats(projectId, issueId, '30d'),
      getIssueActivity(projectId, issueId),
      getProjectRepository(projectId),
      getIssueGitHub(projectId, issueId),
      listUserReports(projectId, issueId),
      listEventAttachments(projectId, issueId, eventId),
    ]);

    return {
      project,
      issue,
      event,
      navigation,
      aggregates,
      stats,
      activity,
      repository,
      code,
      userReports,
      attachments,
    };
  },
  head: ({ loaderData }) => {
    const t = translator('projectPages');

    if (!loaderData?.project.success || !loaderData.event.success) {
      return { meta: [{ title: t('event.meta.eventNotFound') }] };
    }

    return {
      meta: [
        {
          title: t('projectTitle', { project: loaderData.project.data.name }),
        },
        { name: 'description', content: t('event.meta.description') },
      ],
    };
  },
  // The event view is seven requests behind one loader, so it is the one
  // screen with a visible wait. This is the same skeleton Next rendered from
  // `loading.tsx`, mounted the same way: after `defaultPendingMs`, so a fast
  // network never flashes it.
  pendingComponent: EventLoading,
  component: EventPage,
});

const LEVEL_TEXT: Record<string, string> = {
  fatal: 'text-red-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-sky-500',
  debug: 'text-muted-foreground',
};

function EventPage() {
  const t = useTranslations('projectPages');
  const { id, issueId } = Route.useParams();
  const {
    project: projectResult,
    issue: issueResult,
    event: eventResult,
    navigation: navigationResult,
    aggregates: aggregatesResult,
    stats: statsResult,
    activity: activityResult,
    repository: repositoryResult,
    code: codeResult,
    userReports: userReportsResult,
    attachments: attachmentsResult,
  } = Route.useLoaderData();
  const projectId = Number.parseInt(id, 10);

  // The four the page cannot render without.
  if (!projectResult.success) {
    return (
      <LoadFailure error={projectResult.error} title={t('loadProjectFailed')} />
    );
  }
  if (!issueResult.success) {
    return (
      <LoadFailure error={issueResult.error} title={t('loadIssueFailed')} />
    );
  }
  if (!eventResult.success) {
    return (
      <LoadFailure error={eventResult.error} title={t('event.loadFailed')} />
    );
  }
  if (!navigationResult.success) {
    return (
      <LoadFailure
        error={navigationResult.error}
        title={t('event.loadNavigationFailed')}
      />
    );
  }

  // The three that decorate the page. Each already degraded on failure before
  // the Result conversion; the degradation is now written out rather than
  // hidden behind a `.catch()`, and it stays deliberate: an issue with no tags
  // and an aggregates endpoint that failed genuinely render the same panel, and
  // neither is worth taking the event view down for.
  return (
    <EventView
      projectId={projectId}
      issueId={issueId}
      issue={issueResult.data}
      event={eventResult.data}
      navigation={navigationResult.data}
      aggregates={aggregatesResult.success ? aggregatesResult.data : null}
      stats30d={statsResult.success ? statsResult.data : null}
      activity={activityResult.success ? activityResult.data : []}
      repository={repositoryResult.success ? repositoryResult.data : undefined}
      code={codeResult.success ? codeResult.data : null}
      userReports={userReportsResult.success ? userReportsResult.data : []}
      attachments={attachmentsResult.success ? attachmentsResult.data : []}
    />
  );
}

function EventView({
  projectId,
  issueId,
  issue,
  event,
  navigation,
  aggregates,
  stats30d,
  activity,
  repository,
  code,
  userReports,
  attachments,
}: {
  projectId: number;
  issueId: string;
  issue: IssueResponse;
  event: EventDetailResponse;
  navigation: EventNavigation;
  aggregates: IssueAggregates | null;
  stats30d: IssueStatsResponse | null;
  activity: ActivityEntry[];
  /** The project's GitHub repository: `null` without one, `undefined` when
   * it could not be loaded. */
  repository: ProjectRepository | null | undefined;
  code: IssueGitHub | null;
  /** Feedback users sent about this issue. */
  userReports: UserReport[];
  /** Files sent with the event. */
  attachments: AttachmentInfo[];
}) {
  const t = useTranslations('projectPages');
  const eventData = event.data as Record<string, unknown>;
  const payload = readEventPayload(eventData);
  const { has } = payload;
  const { type: titleType, message } = splitIssueTitle(
    issue.title,
    issue.value,
  );
  const levelText =
    LEVEL_TEXT[(event.level ?? '').toLowerCase()] ?? 'text-muted-foreground';

  const userCount = aggregates?.user_count ?? 0;

  // One entry per section the event actually has. Labelled here rather than
  // in `eventJumpTargets` so every message key stays a literal the
  // message-keys architecture rule can check.
  const SECTION_LABELS: Record<EventJumpTarget, string> = {
    highlights: t('event.sectionHighlights'),
    stacktrace: t('event.sectionStackTrace'),
    breadcrumbs: t('event.sectionBreadcrumbs'),
    tags: t('event.sectionTags'),
    context: t('event.sectionContext'),
  };
  const jumps = eventJumpTargets(has).map((id) => ({
    id,
    label: SECTION_LABELS[id],
  }));

  const rail = (
    <EventRail
      projectId={projectId}
      issueId={issueId}
      issue={issue}
      activity={activity}
      code={code}
      connected={repository === undefined ? null : repository !== null}
    />
  );
  const sourceUrl = repository
    ? (frame: { filename?: string; lineno?: number | null }) =>
        frameSourceUrl(repository, frame.filename, frame.lineno)
    : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      <EventHeader
        issue={issue}
        projectId={projectId}
        titleType={titleType}
        message={message}
        levelText={levelText}
        userCount={userCount}
        // Links outlive a disconnected repository and can still be unlinked.
        // Unloaded links are not "no links": offering Create then could
        // open a second GitHub issue for one already linked.
        githubLinks={
          code && (repository || code.links.length > 0) ? code.links : null
        }
        githubConnected={repository != null}
      />

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="w-full px-4 md:px-8 py-5 space-y-5">
            <EventTrends stats={stats30d} aggregates={aggregates} />

            <EventIdentityBar
              projectId={projectId}
              issueId={issueId}
              event={event}
              navigation={navigation}
              jumps={jumps}
            />

            <EventSections
              projectId={projectId}
              userReports={userReports}
              attachments={attachments}
              event={event}
              payload={payload}
              eventData={eventData}
              sourceUrl={sourceUrl}
            />

            {/* Right rail (mobile) */}
            <div className="lg:hidden rounded-lg border bg-card overflow-hidden">
              {rail}
            </div>
          </div>
        </main>

        {/* Right rail (desktop, collapsible) */}
        <CollapsibleRail title={t('event.details')}>{rail}</CollapsibleRail>
      </div>
    </div>
  );
}
