'use client';

import { useLenis } from 'lenis/react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { formatReleaseDate, type ReleasePulse } from '@/lib/release';
import { cn } from '@/lib/utils';
import { EASE } from '../landing/motion';

const TONE: Record<ReleasePulse['channel'], string> = {
  minor: 'bg-primary',
  patch: 'bg-foreground/35',
  seed: 'bg-foreground/20',
};

/**
 * The whole history on one line: a bar per release, oldest on the left, as
 * tall as the number of changes it carried. Minor releases in lime. Hovering
 * names a release in the readout; clicking goes to it, fetching it first if it
 * is in a part of the archive the page has not loaded.
 */
export function ReleaseStrip({
  pulse,
  onSelect,
}: {
  pulse: ReleasePulse[];
  /** Returns false when the release is already on the page. */
  onSelect: (anchor: string) => boolean;
}) {
  const lenis = useLenis();
  const [hover, setHover] = useState<ReleasePulse | null>(null);
  const history = [...pulse].reverse();
  const peak = Math.max(...history.map((release) => release.total));
  const changes = history.reduce((sum, release) => sum + release.total, 0);

  const go = (anchor: string) => {
    if (onSelect(anchor)) return;
    if (lenis) lenis.scrollTo(`#${anchor}`, { offset: -96, duration: 1.6 });
    else
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
  };

  let year = '';

  return (
    <div onPointerLeave={() => setHover(null)}>
      <div className="flex h-16 items-end gap-[2px] sm:h-24 sm:gap-[3px]">
        {history.map((release, i) => {
          const active = hover === release;
          return (
            <button
              key={release.anchor}
              type="button"
              aria-label={`${release.version}: ${release.title}`}
              onPointerEnter={() => setHover(release)}
              onFocus={() => setHover(release)}
              onClick={() => go(release.anchor)}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-end"
            >
              <m.span
                className={cn(
                  'block w-full origin-bottom rounded-[1px] transition-opacity duration-300',
                  TONE[release.channel],
                  hover && !active && 'opacity-35',
                )}
                style={{
                  height: `${Math.max(6, (release.total / peak) * 100)}%`,
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 1, ease: EASE, delay: 0.9 + i * 0.018 }}
              />
            </button>
          );
        })}
      </div>

      {/* Years under the first release of each, on the same flex track so
          they line up with the bars above. */}
      <div aria-hidden className="mt-3 flex gap-[2px] sm:gap-[3px]">
        {history.map((release) => {
          const starts = release.date.slice(0, 4) !== year;
          year = release.date.slice(0, 4);
          return (
            <span
              key={release.anchor}
              className="min-w-0 flex-1 overflow-visible font-mono text-[10.5px] tracking-[0.16em] whitespace-nowrap text-muted-foreground"
            >
              {starts ? year : null}
            </span>
          );
        })}
      </div>

      <p className="mt-5 h-5 truncate font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {hover ? (
          <>
            <span className="text-foreground">{hover.version}</span>
            <span className="mx-3 opacity-50">/</span>
            {hover.title}
            <span className="mx-3 hidden opacity-50 sm:inline">/</span>
            <span className="hidden sm:inline">
              {formatReleaseDate(hover.date)}
            </span>
            <span className="mx-3 opacity-50">/</span>
            {hover.total} changes
          </>
        ) : (
          <>
            {history.length} releases<span className="mx-3 opacity-50">/</span>
            {changes} changes
          </>
        )}
      </p>
    </div>
  );
}
