import Link from 'next/link';
import { formatDate, type Post } from '@/lib/blog';
import { cn } from '@/lib/utils';
import { GRID } from '../editorial/grid';
import { BlurIn, Rule } from '../editorial/motion';

function Neighbour({ post, label }: { post: Post; label: string }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block py-6">
      <span className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase transition-colors duration-500 group-hover:text-primary">
        {label}
      </span>
      <span className="mt-3 block max-w-[24ch] text-[24px] leading-[1.15] tracking-[-0.025em] text-foreground transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5 sm:text-[30px]">
        {post.title}
      </span>
      <time
        dateTime={post.date}
        className="mt-3 block font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
      >
        {formatDate(post.date)}
      </time>
    </Link>
  );
}

/** The posts either side of this one, in the reading column. */
export function PostNeighbours({
  older,
  newer,
}: {
  older: Post | null;
  newer: Post | null;
}) {
  if (!older && !newer) return null;

  return (
    <nav aria-label="More posts">
      <Rule />
      <div className={cn(GRID, 'pt-10 pb-28 lg:pb-40')}>
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          Keep reading
        </p>
        <div className="mt-4 divide-y divide-rule lg:mt-0 lg:-translate-y-6">
          {newer ? (
            <BlurIn>
              <Neighbour post={newer} label="Newer ↑" />
            </BlurIn>
          ) : null}
          {older ? (
            <BlurIn index={1}>
              <Neighbour post={older} label="Older ↓" />
            </BlurIn>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
