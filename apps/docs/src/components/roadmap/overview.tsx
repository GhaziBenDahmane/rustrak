'use client';

import { useLenis } from 'lenis/react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { EASE } from '../landing/motion';
import { type Item, STAGES, slug } from './data';

const TONE: Record<string, string> = {
  Now: 'bg-primary',
  Next: 'bg-foreground/75',
  Maybe: 'bg-foreground/30',
};

/**
 * The whole roadmap on one line: a segment per item, grouped by stage and
 * read left to right from in flight to furthest out. Hovering a segment names it
 * in the readout underneath; clicking scrolls to it.
 */
export function Overview() {
  const lenis = useLenis();
  const [hover, setHover] = useState<{ item: Item; stage: string } | null>(
    null,
  );
  const stages = STAGES;
  const total = stages.reduce((sum, stage) => sum + stage.items.length, 0);
  const building = STAGES.find((stage) => stage.label === 'Now')?.items.length;

  const go = (item: Item) => {
    const target = `#${slug(item.title)}`;
    if (lenis) lenis.scrollTo(target, { offset: -140, duration: 1.6 });
    else document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
  };

  let n = 0;

  return (
    <div onPointerLeave={() => setHover(null)}>
      <div className="flex gap-3 sm:gap-6">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className="min-w-0"
            style={{ flex: stage.items.length }}
          >
            <div className="mb-3 flex items-baseline gap-2 font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">
              <span className={cn(stage.label === 'Now' && 'text-primary')}>
                {stage.label}
              </span>
              <span className="hidden opacity-60 sm:inline">
                {String(stage.items.length).padStart(2, '0')}
              </span>
            </div>
            <div className="flex gap-1">
              {stage.items.map((item) => {
                const delay = 0.9 + n++ * 0.05;
                const active = hover?.item === item;
                return (
                  <button
                    key={item.title}
                    type="button"
                    aria-label={item.title}
                    onPointerEnter={() =>
                      setHover({ item, stage: stage.label })
                    }
                    onFocus={() => setHover({ item, stage: stage.label })}
                    onClick={() => go(item)}
                    className="group flex h-6 flex-1 cursor-pointer items-end"
                  >
                    <m.span
                      className={cn(
                        'block w-full origin-left rounded-full transition-[height,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        TONE[stage.label],
                        active ? 'h-3' : 'h-1',
                        hover && !active && 'opacity-40',
                      )}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.9, ease: EASE, delay }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed height, so the readout swapping text never moves the page. */}
      <p className="mt-5 h-5 truncate font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {hover ? (
          <>
            <span className="text-foreground">{hover.item.title}</span>
            <span className="mx-3 opacity-50">/</span>
            {hover.stage}
            <span className="mx-3 opacity-50">/</span>
            {hover.item.area}
          </>
        ) : (
          <>
            {total} items<span className="mx-3 opacity-50">/</span>
            {building} in progress
          </>
        )}
      </p>
    </div>
  );
}
