/**
 * Every block on the page sits on this grid: a label column and a reading
 * column. The intro, every stage and the closing line all start their text on
 * the same two verticals, which is most of what makes the page feel ordered.
 *
 * Its own module, not `stages.tsx`: a server component importing a constant
 * from a client module gets a reference to it, not the string.
 */
export const GRID =
  'mx-auto grid max-w-[1440px] px-5 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-x-20';
