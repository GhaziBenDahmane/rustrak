import Link from 'next/link';
import { notFound } from 'next/navigation';
import { importPage } from 'nextra/pages';
import { MermaidFit } from '@/components/blog/mermaid-fit';
import { PostNeighbours } from '@/components/blog/post-neighbours';
import { ReadingRail, type TocItem } from '@/components/blog/reading-rail';
import { GRID } from '@/components/editorial/grid';
import { PageHead, Rule } from '@/components/editorial/motion';
import { Shell } from '@/components/editorial/shell';
import {
  formatDate,
  getNeighbourPosts,
  getPost,
  getPosts,
  shortReadingTime,
} from '@/lib/blog';
import { cn } from '@/lib/utils';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const result = getPost(slug);
  if (!result) return {};
  const { post } = result;
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      ...(post.image ? { images: [{ url: post.image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

/** The element the reading progress is measured against. */
const BODY_ID = 'post-body';

/**
 * A post.
 *
 * The content still goes through Nextra: unlike the changelog, posts carry
 * fenced code, and `importPage` is what gives them highlighting, a copy button
 * and — the reason it matters here — the heading ids and `toc` the rail beside
 * the text is built from. There is nothing to gain by rendering them by hand.
 *
 * The layout is two columns that become one: the text in a measured column and
 * the contents pinned beside it, collapsing to the text alone below `lg`. The
 * rail's own cell stays in the tree at every width even when its list is
 * hidden, because the progress bar lives in the same component and a phone
 * wants that as much as a desktop does.
 */
export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const result = getPost(slug);
  if (!result) notFound();

  const { post } = result;
  const { older, newer } = getNeighbourPosts(slug);

  let MDXContent: React.ComponentType;
  let toc: TocItem[] = [];
  try {
    const imported = await importPage(['blog', slug]);
    MDXContent = imported.default;
    // Third-level headings and deeper would turn the rail into an outline of
    // an outline; two levels is what fits beside the text without scrolling.
    toc = imported.toc.filter((item) => item.depth <= 3);
  } catch {
    notFound();
  }

  return (
    <Shell>
      <PageHead
        above={
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-primary"
          >
            <span aria-hidden>←</span>
            Blog
          </Link>
        }
        title={post.title}
        meta={
          <>
            <p className="text-foreground">{post.author}</p>
            <p className="mt-1.5">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span className="mx-2.5 opacity-50">/</span>
              {shortReadingTime(post.readingTime)}
            </p>
            {post.tags.length > 0 ? (
              <p className="mt-1.5 normal-case tracking-[0.06em]">
                {post.tags.join(' · ')}
              </p>
            ) : null}
          </>
        }
        lead={post.description ? <p>{post.description}</p> : null}
      />
      <Rule />
      {/* Contents in the label column, sticky beside the prose; on a phone
          only the reading-progress hairline survives. */}
      <div className={cn(GRID, 'pt-12 pb-24 sm:pt-16 lg:pb-32')}>
        <div className="min-w-0">
          <ReadingRail items={toc} bodyId={BODY_ID} />
        </div>
        <article id={BODY_ID} className="blog-prose min-w-0">
          <MDXContent />
          <MermaidFit bodyId={BODY_ID} />
        </article>
      </div>
      <PostNeighbours older={older} newer={newer} />
    </Shell>
  );
}
