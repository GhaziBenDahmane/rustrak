/**
 * Sentry's three feedback mailboxes, each an issue status: Spam is a muted
 * (`ignored`) feedback, as in Sentry's own UI.
 */
export const MAILBOXES = ['inbox', 'resolved', 'spam'] as const;
export type Mailbox = (typeof MAILBOXES)[number];

/** The issue list filter a mailbox reads. */
export const MAILBOX_FILTER = {
  inbox: 'open',
  resolved: 'resolved',
  spam: 'muted',
} as const satisfies Record<Mailbox, string>;
