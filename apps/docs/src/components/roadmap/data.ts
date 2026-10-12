/**
 * The roadmap, as data. Updating the roadmap is editing this file and nothing
 * else. Stages, not dates: order says what comes first, not when.
 */

export type Area =
  | 'Server'
  | 'Dashboard'
  | 'Integrations'
  | 'Automation'
  | 'Mobile';

export interface Item {
  title: string;
  note: string;
  area: Area;
  /** Shown when the row is opened. Rows without it do not open. */
  detail?: string;
  /** Issue or discussion to follow. */
  href?: string;
}

export interface Stage {
  label: string;
  blurb: string;
  items: Item[];
  /** Drawn quieter: not committed to. */
  quiet?: boolean;
}

/** Shown as "Updated …" so readers know how fresh the page is. */
export const UPDATED = '2026-10-12';

export const STAGES: Stage[] = [
  {
    label: 'Now',
    blurb: 'Being built right now.',
    items: [
      {
        title: 'GitHub integration',
        note: 'Connect a project to its repository and work with issues from GitHub.',
        area: 'Integrations',
      },
      {
        title: 'Sentry monitors',
        note: 'Check-ins from the Sentry SDKs, so missed and failing jobs show up in Rustrak.',
        area: 'Server',
      },
      {
        title: 'Dashboard end-to-end tests',
        note: 'End-to-end tests covering the main flows of the dashboard.',
        area: 'Dashboard',
      },
    ],
  },
  {
    label: 'Next',
    blurb: 'Planned to follow.',
    items: [
      {
        title: 'UI and UX redesign',
        note: 'A complete redesign of the dashboard, from navigation to every screen.',
        area: 'Dashboard',
      },
      {
        title: 'Node-based automation',
        note: 'Build workflows from nodes, in the spirit of n8n: an event comes in, the nodes decide what happens.',
        area: 'Automation',
      },
    ],
  },
  {
    label: 'Maybe',
    blurb: 'Further out. Not decided yet.',
    quiet: true,
    items: [
      {
        title: 'Mobile app',
        note: 'Follow and triage issues from your phone.',
        area: 'Mobile',
      },
    ],
  },
];

export const slug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
