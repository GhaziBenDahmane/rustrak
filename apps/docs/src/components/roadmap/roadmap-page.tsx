import { GRID } from '../editorial/grid';
import { PageHead } from '../editorial/motion';
import { Shell } from '../editorial/shell';
import { GITHUB } from '../landing/links';
import { UPDATED } from './data';
import { Overview } from './overview';
import { Stages } from './stages';

const updated = new Date(`${UPDATED}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The public roadmap: a title, the whole plan on one line, then the stages in
 * order. No dates; order is the only promise it makes.
 */
export function RoadmapPage() {
  return (
    <Shell>
      <PageHead
        title="Roadmap"
        meta={`Updated ${updated}`}
        lead={
          <p>
            <span className="text-foreground">
              What we are building now, and what comes after it.
            </span>{' '}
            In order of priority, not on a calendar.
          </p>
        }
      />

      <div className="mx-auto max-w-[1440px] px-5 pb-20 sm:px-10 lg:pb-28">
        <Overview />
      </div>

      <Stages />

      <div className={`${GRID} pb-32 lg:pb-44`}>
        <p className="text-[15px] text-muted-foreground lg:col-start-2">
          Missing something?{' '}
          <a
            href={`${GITHUB}/issues/new`}
            className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors duration-300 hover:decoration-primary"
          >
            Open an issue
          </a>
          .
        </p>
      </div>
    </Shell>
  );
}
