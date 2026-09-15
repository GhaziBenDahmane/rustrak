import { projectFiles } from 'archunit';
import { describe, expect, it } from 'vitest';

/**
 * No barrel files. Ever.
 *
 * Feature-Sliced Design gives every slice an `index.ts` as its public surface,
 * and this codebase deliberately does not. The reason is recorded in the spec
 * and it is not a preference: it was tried on the `issue` pilot and **the build
 * failed with 11 errors**. A barrel that re-exports both `api/queries.ts`
 * (`import 'server-only'`) and `ui/issues-list.tsx` (`'use client'`) dragged
 * the server-only poison pill into every client component that imported
 * anything at all from the slice.
 *
 * That specific failure went with the Server Components, and the rule stays,
 * because the generic case was always the larger half: barrels defeat
 * tree-shaking, invite import cycles, and make a bundler resolve a whole slice
 * to fetch one component. On a bundle the browser downloads before it can draw
 * anything, that matters more here than it did there.
 *
 * What replaces the guarantee a barrel would give: the **segment** is the
 * boundary, not the file. `features/issue/ui/…` is public by convention, and
 * [slice-isolation](./slice-isolation.test.ts) is what actually keeps slices
 * apart. The accepted cost is that internals are not private, so renaming a
 * file inside a slice touches its importers.
 */

describe('no barrel files', () => {
  /**
   * The population, asserted through a rule that must find plenty.
   *
   * `shouldNot().haveName('index.ts')` passes when the tree has no barrels and
   * also when the glob matched no files whatsoever. archunit guards the second
   * case itself -- an empty match raises `EmptyTestViolation` rather than
   * passing -- but that guard fires on *zero*, not on "one file out of two
   * hundred". This asserts the real size, so the glob is reaching the whole
   * tree.
   */
  it('reaches the population it expects to reach', async () => {
    const everyComponent = await projectFiles()
      .inFolder('src/**')
      .shouldNot()
      .haveName('*.tsx')
      .check();

    expect(everyComponent.length).toBeGreaterThanOrEqual(140);
  });

  it('has no index.ts anywhere under src/', async () => {
    const rule = projectFiles()
      .inFolder('src/**')
      .shouldNot()
      .haveName('index.ts');

    await expect(rule).toPassAsync();
  });

  /**
   * `routes/` is exempt from the `.tsx` half, and only from that half.
   *
   * There `index.tsx` is not a barrel, it is the framework's spelling for "the
   * route at this path" -- `routes/_authenticated/projects/index.tsx` is
   * `/projects`. Renaming it would unroute the page, the same way renaming
   * `page.tsx` did under Next.
   *
   * The exemption is by folder rather than by content because the risk it
   * gives up is nil: `routes/` may not be imported by anything (see
   * `layer-direction`), so a barrel there would have no consumer to poison.
   * `index.ts` stays banned everywhere, `routes/` included, because nothing in
   * the routing contract asks for one.
   */
  it('has no index.tsx outside routes/', async () => {
    const rule = projectFiles()
      .inFolder('src/{features,shared}/**')
      .shouldNot()
      .haveName('index.tsx');

    await expect(rule).toPassAsync();
  });
});
