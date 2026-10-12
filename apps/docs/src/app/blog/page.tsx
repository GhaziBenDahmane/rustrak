import type { Metadata } from 'next';
import { PostEntry } from '@/components/blog/post-list';
import { PageHead } from '@/components/editorial/motion';
import { Shell } from '@/components/editorial/shell';
import { getPosts, getTagCounts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Updates, releases, and engineering notes from the Rustrak project.',
};

/** The blog index: a title, then a band per post, newest first. */
export default function BlogPage() {
  const posts = getPosts();
  const tags = getTagCounts();

  return (
    <Shell>
      <PageHead
        title="Blog"
        meta={
          <>
            <p>
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </p>
            {tags.length > 0 ? (
              <p className="mt-1.5 normal-case tracking-[0.06em]">
                {tags.map(({ tag }) => tag).join(' · ')}
              </p>
            ) : null}
          </>
        }
        lead={
          <p>
            <span className="text-foreground">Notes from building it.</span>{' '}
            Release announcements, and the longer write-ups of how a piece of
            Rustrak works once it is finished.
          </p>
        }
      />

      {posts.length > 0 ? (
        posts.map((post, index) => (
          <PostEntry
            key={post.slug}
            post={post}
            index={posts.length - index}
            latest={index === 0}
          />
        ))
      ) : (
        <p className="mx-auto max-w-[1440px] px-5 py-16 text-[15px] text-muted-foreground sm:px-10">
          No posts yet. Check back soon.
        </p>
      )}
      <div className="pb-24 lg:pb-32" />
    </Shell>
  );
}
