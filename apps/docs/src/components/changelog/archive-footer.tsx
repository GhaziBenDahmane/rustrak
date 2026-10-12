'use client';

import { cn } from '@/lib/utils';
import { GRID } from '../editorial/grid';
import { Rule } from '../editorial/motion';
import type { ArchiveStatus } from './use-release-archive';

/** The end of what is loaded: either a way to fetch more, or the first release. */
export function ArchiveFooter({
  loaded,
  total,
  nextBatch,
  status,
  hasMore,
  onLoadMore,
}: {
  loaded: number;
  total: number;
  nextBatch: number;
  status: ArchiveStatus;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      <Rule />
      <div className={cn(GRID, 'pt-10 pb-32 lg:pb-44')}>
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase tabular-nums">
          {status === 'error'
            ? 'Could not reach the archive'
            : `${loaded} of ${total} releases`}
        </p>
        <div className="mt-6 lg:mt-0" aria-live="polite">
          {hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={status === 'loading'}
              className="group flex cursor-pointer items-baseline gap-4 text-left disabled:cursor-wait"
            >
              <span
                className={cn(
                  'text-[26px] tracking-[-0.025em] text-foreground transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5 sm:text-[32px]',
                  status === 'loading' && 'animate-pulse',
                )}
              >
                {status === 'loading'
                  ? 'Loading…'
                  : status === 'error'
                    ? 'Try again'
                    : `${nextBatch} earlier release${nextBatch === 1 ? '' : 's'}`}
              </span>
              <span
                aria-hidden
                className="font-mono text-[13px] text-muted-foreground transition-colors group-hover:text-primary"
              >
                ↓
              </span>
            </button>
          ) : (
            <p className="text-[26px] tracking-[-0.025em] text-foreground/55 sm:text-[32px]">
              That was the first release.
            </p>
          )}
          <noscript>
            <p className="mt-4 text-[14px] text-muted-foreground">
              The remaining {total - loaded} releases load on demand and need
              JavaScript. They are also on{' '}
              <a
                className="underline underline-offset-4 hover:text-primary"
                href="https://github.com/AbianS/rustrak/releases"
              >
                GitHub Releases
              </a>
              .
            </p>
          </noscript>
        </div>
      </div>
    </>
  );
}
