import { createRouter } from '@tanstack/react-router';
import { NotFoundScreen } from '@/shared/ui/components/not-found-screen';
import { OutageScreen } from '@/shared/ui/components/outage-screen';
import { routeTree } from './routeTree.gen';

/**
 * The router.
 *
 * `basepath` is left at `/` deliberately: the bundle is served from the root of
 * the server's origin, and a sub-path deployment would have to change this
 * *and* `base` in `vite.config.ts` together.
 */
export function createAppRouter() {
  return createRouter({
    routeTree,
    // Every screen fetches through a loader, and the loaders are the reason
    // there is no spinner between two pages of the same table: the router
    // keeps the old page rendered until the new data is in. `0` would flash
    // the pending component on a fast network, which is worse than waiting.
    defaultPendingMs: 300,
    defaultPendingMinMs: 300,
    // A route that has no data of its own must not go stale between two
    // navigations to it; a route that does declares its own.
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFoundScreen,
    defaultErrorComponent: ({ error }) => (
      <OutageScreen
        error={{
          kind: 'network',
          reason: 'unreachable',
          message: error instanceof Error ? error.message : String(error),
        }}
      />
    ),
    // Scroll restoration is what a browser does for a document and what a
    // client-routed application has to do for itself. Without it, following a
    // link from halfway down the issues list opens the issue halfway down.
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
