import type {
  AttachmentInfo,
  EventDetailResponse,
  IssuesListUserReportsResponse,
} from '@rustrak/client';
import { useTranslations } from 'use-intl';
import type { readEventPayload } from '@/features/event/lib/event-payload';
import { readFeedback } from '@/features/event/lib/feedback';
import { formatStackTraceAsText } from '@/features/event/lib/format-stack-trace';
import { Breadcrumbs } from '@/features/event/ui/components/breadcrumbs';
import { EventContext } from '@/features/event/ui/components/event-context';
import { EventDetails } from '@/features/event/ui/components/event-details';
import { EventHighlights } from '@/features/event/ui/components/event-highlights';
import { EventTags } from '@/features/event/ui/components/event-tags';
import { FeedbackSection } from '@/features/event/ui/components/feedback-section';
import { RawJson } from '@/features/event/ui/components/raw-json';
import type { FrameSourceUrl } from '@/features/event/ui/components/stack-frame-item';
import { StackTrace } from '@/features/event/ui/components/stack-trace';
import { ThreadsSection } from '@/features/event/ui/components/threads-section';
import { UserFeedback } from '@/features/issue/ui/components/user-feedback';
import { Section } from '@/shared/ui/components/collapsible-section';
import { CopyAsDropdown } from '@/shared/ui/components/copy-as-dropdown';

type EventPayload = ReturnType<typeof readEventPayload>;

/**
 * The stacked detail sections of an event, in reading order.
 *
 * Every one of them is conditional on the payload actually carrying that kind
 * of data, which is why it takes the whole parsed payload rather than a
 * flattened set of props: the `has` flags and the values they guard have to
 * come from the same parse or they can disagree.
 */
export function EventSections({
  projectId,
  issueId,
  userReports,
  attachments,
  event,
  payload,
  eventData,
  sourceUrl,
}: {
  projectId: number;
  issueId: string;
  /** The newest page of feedback users sent about the issue, shown on an
   * error issue; `null` when it could not be loaded. */
  userReports: IssuesListUserReportsResponse | null;
  /** Files sent with the event, shown with a feedback. */
  attachments: AttachmentInfo[];
  event: EventDetailResponse;
  payload: EventPayload;
  eventData: Record<string, unknown>;
  sourceUrl?: FrameSourceUrl;
}) {
  const t = useTranslations('projectPages');
  const {
    exception,
    breadcrumbs,
    threads,
    contexts,
    modules,
    user,
    tags: safeTags,
    has,
  } = payload;
  const feedback = readFeedback(eventData);

  return (
    <div className="rounded-lg border bg-card px-4">
      {feedback && (
        <Section id="feedback" title={t('event.sectionFeedback')}>
          <FeedbackSection
            feedback={feedback}
            errorHref={
              feedback.associatedEventId
                ? `/projects/${projectId}/events/sentry/${feedback.associatedEventId}`
                : null
            }
            attachments={attachments}
            attachmentHref={(attachment) =>
              `/api/projects/${projectId}/attachments/${attachment.id}`
            }
          />
        </Section>
      )}

      {userReports && userReports.items.length > 0 && (
        <Section id="user-feedback" title={t('event.sectionUserFeedback')}>
          {/* A new report shifts the page offsets, so it drops older pages. */}
          <UserFeedback
            key={`${issueId}:${userReports.total_count}`}
            projectId={projectId}
            issueId={issueId}
            firstPage={userReports}
          />
        </Section>
      )}

      <Section id="highlights" title={t('event.sectionHighlights')}>
        <EventHighlights
          event={event}
          tags={safeTags}
          contexts={contexts}
          eventData={eventData}
        />
      </Section>

      {has.stackTrace && (
        <Section
          id="stacktrace"
          title={t('event.sectionStackTrace')}
          actions={
            // ThreadsSection owns its own copy control — the active
            // thread/exception pairing is client state the section
            // header (a Server Component) can't see.
            has.threads ? undefined : (
              <CopyAsDropdown
                formats={[
                  {
                    label: t('event.formatPlainText'),
                    value: formatStackTraceAsText(exception, event.platform),
                  },
                  {
                    label: t('event.formatJson'),
                    value: JSON.stringify(exception, null, 2),
                  },
                ]}
              />
            )
          }
        >
          {has.threads ? (
            <ThreadsSection
              threads={threads}
              exception={exception}
              platform={event.platform}
              sourceUrl={sourceUrl}
            />
          ) : (
            <StackTrace
              exception={exception}
              platform={event.platform}
              sourceUrl={sourceUrl}
            />
          )}
        </Section>
      )}

      {has.breadcrumbs && (
        <Section
          id="breadcrumbs"
          title={t('event.sectionBreadcrumbs')}
          actions={
            <CopyAsDropdown
              formats={[
                {
                  label: t('event.formatJson'),
                  value: JSON.stringify(breadcrumbs, null, 2),
                },
              ]}
            />
          }
        >
          <Breadcrumbs breadcrumbs={breadcrumbs} />
        </Section>
      )}

      {has.tags && (
        <Section id="tags" title={t('event.sectionTags')}>
          <EventTags tags={safeTags} />
        </Section>
      )}

      {(has.contexts || has.modules || has.user) && (
        <Section id="context" title={t('event.sectionContext')}>
          <EventContext contexts={contexts} modules={modules} user={user} />
        </Section>
      )}

      <Section id="details" title={t('event.sectionDetails')}>
        <EventDetails event={event} />
      </Section>

      <Section id="raw" title={t('event.sectionRawJson')} defaultOpen={false}>
        <RawJson data={eventData} />
      </Section>
    </div>
  );
}
