import type { ReactNode } from 'react';
import { GridFrame } from '@/components/frame/grid';
import { LandingNav } from '../landing/nav/nav';
import { SiteFooter } from '../landing/sections/footer';
import { SmoothScroll } from '../landing/smooth-scroll';

/**
 * The frame around the roadmap, the changelog and the blog: the landing's
 * dark-locked palette, its bar and its footer, and nothing of the docs theme.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <SmoothScroll>
      <div className="landing-root dark relative min-h-screen antialiased">
        <LandingNav />
        {/* Opts these pages into the docs search, which indexes only marked
            regions; the docs theme used to mark them. */}
        <main data-pagefind-body>{children}</main>
        <GridFrame topRule>
          <SiteFooter />
        </GridFrame>
      </div>
    </SmoothScroll>
  );
}
