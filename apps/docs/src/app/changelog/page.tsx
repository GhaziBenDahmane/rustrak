import type { Metadata } from 'next';
import { ChangelogFeed } from '@/components/changelog/changelog-feed';
import { PageHead } from '@/components/editorial/motion';
import { Shell } from '@/components/editorial/shell';
import {
  getChunkCount,
  getPulse,
  getReleaseChunk,
  getReleases,
  RELEASES_PER_CHUNK,
} from '@/lib/changelog';
import { formatReleaseDate } from '@/lib/release';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Release notes and version history for the Rustrak project.',
};

/**
 * The changelog, in the roadmap's language: a title, the whole history as one
 * strip, then a band per release.
 *
 * It grows forever, so only the first chunk is inlined and the rest is fetched
 * on demand (see `changelog-feed.tsx`). `chunkByAnchor` maps every release to
 * its chunk so a deep link, or a click on the strip, can reach a release the
 * page has not fetched yet.
 */
export default function ChangelogPage() {
  const releases = getReleases();
  const first = getReleaseChunk(1);
  const latest = releases[0];

  const chunkByAnchor: Record<string, number> = {};
  releases.forEach((release, index) => {
    const chunk = Math.floor(index / RELEASES_PER_CHUNK) + 1;
    chunkByAnchor[release.anchor] = chunk;
    chunkByAnchor[release.slug] = chunk;
  });

  return (
    <Shell>
      <PageHead
        title="Changelog"
        meta={
          latest ? (
            <>
              <p>Latest {latest.version}</p>
              <p className="mt-1.5">{formatReleaseDate(latest.date)}</p>
            </>
          ) : null
        }
        lead={
          <p>
            <span className="text-foreground">Every release, in order.</span>{' '}
            The server, the dashboard and the client packages ship together
            under one version number.
          </p>
        }
      />
      <ChangelogFeed
        initial={first.releases}
        chunkCount={getChunkCount()}
        total={releases.length}
        perChunk={RELEASES_PER_CHUNK}
        pulse={getPulse()}
        chunkByAnchor={chunkByAnchor}
      />
    </Shell>
  );
}
