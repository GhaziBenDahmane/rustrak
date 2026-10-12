'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GRID } from '../editorial/grid';
import { BlurIn, MaskIn, Rule } from '../editorial/motion';
import { EASE, VIEW } from '../landing/motion';
import { type Item, STAGES, type Stage, slug } from './data';

export function Stages() {
  return (
    <div>
      {STAGES.map((stage, index) => (
        <StageBand key={stage.label} stage={stage} live={index === 0} />
      ))}
    </div>
  );
}

function StageBand({ stage, live }: { stage: Stage; live: boolean }) {
  return (
    <section className="relative">
      <Rule />

      <div className={cn(GRID, 'pt-10 pb-20 sm:pt-14 lg:pt-16 lg:pb-32')}>
        <header className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-start gap-3">
            <MaskIn>
              <h2
                className={cn(
                  'text-[52px] leading-[0.85] tracking-[-0.055em] sm:text-[64px] lg:text-[96px]',
                  stage.quiet ? 'text-foreground/45' : 'text-foreground',
                )}
              >
                {stage.label}
              </h2>
            </MaskIn>
            <span className="mt-1 font-mono text-[11px] text-muted-foreground lg:mt-2.5">
              {String(stage.items.length).padStart(2, '0')}
            </span>
          </div>
          <m.p
            className="mt-4 flex items-center gap-2.5 text-[14px] text-muted-foreground lg:mt-6 lg:text-[15px]"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={VIEW}
            transition={{ duration: 1.2, ease: EASE, delay: 0.35 }}
          >
            {live ? <Live /> : null}
            {stage.blurb}
          </m.p>
        </header>

        <ol className="mt-2 lg:-mt-5">
          {stage.items.map((item, i) => (
            <Row key={item.title} item={item} index={i} quiet={stage.quiet} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * One item. Rows with a `detail` open in place; the rest are plain. The hover
 * nudge and the lime number are the same on both, so the list reads as one.
 */
function Row({
  item,
  index,
  quiet,
}: {
  item: Item;
  index: number;
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openable = Boolean(item.detail);

  const head = (
    <>
      <span className="pt-[0.4em] font-mono text-[11px] text-muted-foreground transition-colors duration-500 group-hover:text-primary">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5">
        <span
          className={cn(
            'block text-[19px] leading-snug tracking-[-0.015em] sm:text-[22px]',
            quiet ? 'text-foreground/55' : 'text-foreground',
          )}
        >
          {item.title}
        </span>
        <span className="mt-2 block max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground">
          {item.note}
        </span>
      </span>
      <span className="flex items-center gap-4 pt-[0.45em]">
        <span className="hidden font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase sm:inline">
          {item.area}
        </span>
        <span
          aria-hidden
          className={cn(
            'relative size-3 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            open && 'rotate-45',
            !openable && 'invisible',
          )}
        >
          <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/60" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
        </span>
      </span>
    </>
  );

  return (
    <BlurIn
      as="li"
      id={slug(item.title)}
      index={index}
      className="scroll-mt-32 border-rule not-first:border-t"
    >
      {openable ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="group grid w-full cursor-pointer grid-cols-[2.75rem_1fr_auto] py-6 text-left sm:py-7"
        >
          {head}
        </button>
      ) : (
        <div className="group grid grid-cols-[2.75rem_1fr_auto] py-6 sm:py-7">
          {head}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open ? (
          /* Opening to `height: auto` has no transform equivalent, and the
             reflow is the point: the rows below have to make room. */
          <m.div
            // react-doctor-disable-next-line react-doctor/no-layout-property-animation
            initial={{ height: 0, opacity: 0 }}
            // react-doctor-disable-next-line react-doctor/no-layout-property-animation
            animate={{ height: 'auto', opacity: 1 }}
            // react-doctor-disable-next-line react-doctor/no-layout-property-animation
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[2.75rem_1fr] pb-8">
              <p className="col-start-2 max-w-[56ch] border-l border-primary/60 pl-4 text-[15px] leading-relaxed text-foreground/80">
                {item.detail}
                {item.href ? (
                  <a
                    href={item.href}
                    className="mt-3 block font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-primary"
                  >
                    Follow on GitHub →
                  </a>
                ) : null}
              </p>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </BlurIn>
  );
}

/** A small lime dot that breathes: the one stage that is moving. */
function Live() {
  return (
    <span className="relative flex size-1.5">
      <span className="absolute -inset-1 animate-pulse rounded-full bg-primary/25 motion-reduce:animate-none" />
      <span className="relative size-1.5 rounded-full bg-primary" />
    </span>
  );
}
