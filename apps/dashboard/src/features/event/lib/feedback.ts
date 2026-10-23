/** What a user submitted through a feedback widget or crash-report form. */
export interface Feedback {
  message: string;
  name: string;
  contactEmail: string;
  /** The page it was sent from: the feedback's own `url`, else the request's. */
  url: string;
  /** The SDK id of the error event the feedback is about. */
  associatedEventId: string | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * The feedback an event carries, or `null` for any other event.
 *
 * A feedback is an event of `type: "feedback"` whose `contexts.feedback`
 * holds the submission (develop.sentry.dev/sdk/telemetry/feedbacks/).
 */
export function readFeedback(
  eventData: Record<string, unknown>,
): Feedback | null {
  if (eventData.type !== 'feedback') return null;
  const contexts = eventData.contexts as Record<string, unknown> | undefined;
  const feedback = (contexts?.feedback ?? {}) as Record<string, unknown>;
  const request = eventData.request as Record<string, unknown> | undefined;
  return {
    message: text(feedback.message),
    name: text(feedback.name),
    contactEmail: text(feedback.contact_email),
    url: text(feedback.url) || text(request?.url),
    associatedEventId: text(feedback.associated_event_id) || null,
  };
}
