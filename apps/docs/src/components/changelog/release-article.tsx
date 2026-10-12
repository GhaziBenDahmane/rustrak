import {
  formatReleaseDate,
  type Release,
  type SectionKind,
} from '@/lib/release';
import { cn } from '@/lib/utils';
import { GRID } from '../editorial/grid';
import { BlurIn, MaskIn, Rule } from '../editorial/motion';

const KIND_TICK: Record<SectionKind, string> = {
  shipped: 'bg-primary',
  improved: 'bg-foreground/40',
  fixed: 'bg-[var(--sev-warning)]',
  documented: 'bg-foreground/25',
};

/**
 * One release as one band, the roadmap's stage layout: the version large in a
 * sticky left column, the notes in the reading column. A patch is drawn a step
 * quieter than a minor, so the shape of the history shows while scrolling.
 */
export function ReleaseArticle({ release }: { release: Release }) {
  const minor = release.channel === 'minor';
  let number = 0;

  return (
    <article id={release.anchor} className="scroll-mt-24">
      {/* The filename, kept as a second anchor so old deep links still land. */}
      <span id={release.slug} aria-hidden className="block scroll-mt-24" />
      <Rule />

      <div className={cn(GRID, 'pt-10 pb-16 sm:pt-14 lg:pt-16 lg:pb-28')}>
        <header className="lg:sticky lg:top-28 lg:self-start">
          <MaskIn>
            <a
              href={`#${release.anchor}`}
              className={cn(
                'block text-[44px] leading-[0.9] tracking-[-0.05em] tabular-nums transition-colors hover:text-primary sm:text-[56px] lg:text-[72px]',
                minor ? 'text-foreground' : 'text-foreground/55',
              )}
            >
              {release.version}
            </a>
          </MaskIn>
          <BlurIn className="mt-5 space-y-1.5 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            <p>
              <time dateTime={release.date}>
                {formatReleaseDate(release.date)}
              </time>
              <span className="mx-2.5 opacity-50">/</span>
              <span className={cn(minor && 'text-primary')}>
                {release.channel === 'seed' ? 'early' : release.channel}
              </span>
            </p>
            {release.tags.length > 0 ? (
              <p className="normal-case tracking-[0.06em] opacity-80">
                {release.tags.join('  ·  ')}
              </p>
            ) : null}
          </BlurIn>
        </header>

        <div className="mt-8 min-w-0 lg:mt-0">
          <BlurIn>
            <h2 className="max-w-[24ch] text-[26px] leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[32px]">
              {release.title}
            </h2>
            {release.description ? (
              <p className="changelog-lead mt-4 max-w-[56ch]">
                {release.description}
              </p>
            ) : null}
          </BlurIn>

          {release.sections.map((section, index) => {
            if (section.title) number += 1;
            return (
              <BlurIn
                // Sections of a fixed release never reorder; an untitled one has only its position.
                // react-doctor-disable-next-line react-doctor/no-array-index-as-key
                key={section.title || index}
                index={index + 1}
                className="mt-12 first:mt-10"
              >
                {section.title ? (
                  <div className="flex items-center gap-3 border-b border-rule pb-3">
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 rounded-full',
                        KIND_TICK[section.kind],
                      )}
                    />
                    <h3 className="font-mono text-[11px] tracking-[0.16em] text-foreground uppercase">
                      {section.title}
                    </h3>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {String(number).padStart(2, '0')}
                    </span>
                  </div>
                ) : null}
                <div
                  className={cn(
                    'changelog-prose max-w-[62ch]',
                    section.title && 'mt-5',
                  )}
                  // react-doctor-disable-next-line react-doctor/dangerous-html-sink
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: the only input is content/changelog/*.mdx, rendered by lib/changelog.ts at build time — nothing here is reachable from a request
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </BlurIn>
            );
          })}
        </div>
      </div>
    </article>
  );
}
