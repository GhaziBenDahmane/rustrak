'use client';

import * as m from 'motion/react-m';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EASE, VIEW } from '../landing/motion';
import { GRID } from './grid';

/**
 * The motion vocabulary shared by the roadmap, the changelog and the blog.
 * Four moves and no more: type rises out of a mask, rules draw across, blocks
 * fade up, list rows sharpen out of a blur. One curve for all of them.
 */

/**
 * Rises out of a mask. A single word goes letter by letter; a sentence goes
 * word by word, so a long title still lands in about a second.
 */
export function Title({
  text,
  as: Tag = 'h1',
  className,
}: {
  text: string;
  as?: 'h1' | 'h2';
  className?: string;
}) {
  const words = text.split(' ');
  const parts = words.length === 1 ? [...text] : words;
  const step = words.length === 1 ? 0.045 : 0.06;

  return (
    <Tag
      aria-label={text}
      className={cn(
        'flex flex-wrap text-foreground',
        words.length === 1
          ? 'text-[clamp(4rem,13vw,11.5rem)] leading-[0.82] tracking-[-0.065em]'
          : 'gap-x-[0.24em] text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.045em]',
        className,
      )}
    >
      {parts.map((part, i) => (
        <span
          // Pieces of a fixed string: position is the identity.
          key={`${i}-${part}`}
          aria-hidden
          className="inline-block overflow-hidden pb-[0.1em]"
        >
          <m.span
            className="inline-block"
            initial={{ y: '105%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 1.2, ease: EASE, delay: 0.15 + i * step }}
          >
            {part}
          </m.span>
        </span>
      ))}
    </Tag>
  );
}

/** Fades up after the title has landed. */
export function Lead({
  children,
  delay = 0.7,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

/**
 * The page opening every editorial page shares: the title on its own line,
 * then a meta column and a lead column on the grid.
 */
export function PageHead({
  title,
  meta,
  lead,
  above,
}: {
  title: string;
  meta: ReactNode;
  lead: ReactNode;
  above?: ReactNode;
}) {
  return (
    <>
      <header className="mx-auto max-w-[1440px] px-5 pt-36 sm:px-10 sm:pt-48">
        {above ? <Lead delay={0.1}>{above}</Lead> : null}
        <Title text={title} className={above ? 'mt-8' : undefined} />
      </header>
      <div className={cn(GRID, 'pt-10 pb-16 sm:pt-14 lg:pb-20')}>
        <Lead>
          <div className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            {meta}
          </div>
        </Lead>
        <Lead>
          <div className="mt-6 max-w-[44ch] text-[17px] leading-relaxed text-muted-foreground sm:text-[19px] lg:mt-0">
            {lead}
          </div>
        </Lead>
      </div>
    </>
  );
}

/** A hairline that draws itself left to right when it scrolls in. */
export function Rule({ className }: { className?: string }) {
  return (
    <m.div
      aria-hidden
      className={cn(
        'mx-5 h-px origin-left bg-foreground/20 sm:mx-10 lg:mx-auto lg:max-w-[calc(1440px-5rem)]',
        className,
      )}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={VIEW}
      transition={{ duration: 1.4, ease: EASE }}
    />
  );
}

/** A large label rising out of its mask as it scrolls in. */
export function MaskIn({
  children,
  className,
  delay = 0.15,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className="overflow-hidden pb-[0.06em]">
      <m.div
        className={className}
        initial={{ y: '100%' }}
        whileInView={{ y: '0%' }}
        viewport={VIEW}
        transition={{ duration: 1.1, ease: EASE, delay }}
      >
        {children}
      </m.div>
    </div>
  );
}

/** Sharpens out of a blur, staggered by `index`. */
export function BlurIn({
  children,
  index = 0,
  className,
  as = 'div',
  id,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: 'div' | 'li';
  id?: string;
}) {
  const Tag = as === 'li' ? m.li : m.div;
  return (
    <Tag
      id={id}
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={VIEW}
      transition={{ duration: 1.1, ease: EASE, delay: 0.25 + index * 0.08 }}
      className={className}
    >
      {children}
    </Tag>
  );
}
