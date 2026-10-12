import Link from 'next/link';
import { formatDateShort, type Post, shortReadingTime } from '@/lib/blog';
import { cn } from '@/lib/utils';
import { GRID } from '../editorial/grid';
import { BlurIn, Rule } from '../editorial/motion';

/**
 * One post as one band: date and subjects in the label column, the title
 * large in the reading column. The latest post gets a larger title and the
 * lime marker; everything else is the same shape.
 */
export function PostEntry({
  post,
  index,
  latest,
}: {
  post: Post;
  index: number;
  latest: boolean;
}) {
  return (
    <article>
      <Rule />
      <Link
        href={`/blog/${post.slug}`}
        className={cn(GRID, 'group py-10 sm:py-14 lg:py-16')}
      >
        <BlurIn className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          <p className="flex items-baseline gap-3">
            <span className="transition-colors duration-500 group-hover:text-primary">
              {String(index).padStart(2, '0')}
            </span>
            <time dateTime={post.date}>{formatDateShort(post.date)}</time>
            {latest ? <span className="text-primary">Latest</span> : null}
          </p>
          <p className="mt-2">
            {shortReadingTime(post.readingTime)}
            {post.tags.length > 0 ? (
              <>
                <span className="mx-2.5 opacity-50">/</span>
                {post.tags.join(' · ')}
              </>
            ) : null}
          </p>
        </BlurIn>

        <BlurIn index={1} className="mt-6 min-w-0 lg:mt-0">
          <div className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5">
            <h2
              className={cn(
                'max-w-[22ch] tracking-[-0.03em] text-foreground',
                latest
                  ? 'text-[32px] leading-[1.05] sm:text-[48px]'
                  : 'text-[26px] leading-[1.1] sm:text-[34px]',
              )}
            >
              {post.title}
            </h2>
            {post.description ? (
              <p className="mt-4 max-w-[56ch] text-[15.5px] leading-relaxed text-muted-foreground">
                {post.description}
              </p>
            ) : null}
            <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase transition-colors duration-500 group-hover:text-primary">
              Read
              <span
                aria-hidden
                className="transition-transform duration-500 group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </div>
        </BlurIn>
      </Link>
    </article>
  );
}
