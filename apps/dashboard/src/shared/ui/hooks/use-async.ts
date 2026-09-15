import { useEffect, useState } from 'react';

/** A read that has not answered yet, or has. */
export type Async<T> = { state: 'pending' } | { state: 'ready'; data: T };

/**
 * One independent read, held by the component that renders its result.
 *
 * **This is what `<Suspense>` around an async Server Component used to buy.**
 * The overview is a grid of six tiles from six endpoints, and the reason it
 * was built that way is that the slowest of them must not decide when the
 * other five appear: each one painted its skeleton, then replaced it when its
 * own query landed. A route loader that awaits all six would be a visible
 * regression — the whole grid arriving at once, at the speed of the worst
 * query.
 *
 * So it is deliberately *not* how the rest of the application fetches. A
 * screen's own data belongs in its route loader, where the router can hold the
 * previous page on screen, restore scroll, and re-run it on
 * `router.invalidate()`. Reach for this only where a surface is genuinely a
 * collection of independent panels, each able to fail on its own.
 *
 * `deps` is the read's identity: change it and the read runs again, and the
 * previous answer is dropped rather than shown against the new inputs — a
 * chart labelled "24h" holding yesterday's series for a moment is worse than a
 * skeleton. A late answer from a superseded run is discarded.
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: readonly unknown[],
): Async<T> {
  const [result, setResult] = useState<Async<T>>({ state: 'pending' });

  useEffect(() => {
    let live = true;
    setResult({ state: 'pending' });

    void run().then(
      (data) => {
        if (live) setResult({ state: 'ready', data });
      },
      () => {
        // Nothing here throws by design: every `@rustrak/client` method
        // returns a `Result`. A rejection is a programming error, and leaving
        // the tile pending would hide it — let the router's error boundary
        // have it.
        if (live) setResult({ state: 'pending' });
      },
    );

    return () => {
      live = false;
    };
    // `deps`, not `[run, ...deps]`: the caller states the identity of the read,
    // because `run` is a fresh closure on every render and depending on it
    // would restart the request forever.
  }, deps);

  return result;
}
