import { projectFiles } from 'archunit';
import { describe, expect, it } from 'vitest';

/**
 * The dependency rule: `routes/` -> `features/` -> `shared/`, and never upward.
 *
 * `routes/` is what `app/` was. The layer did not change when the framework
 * did — it is still routing and composition, and it is still the only layer
 * allowed to know which framework draws it. That is precisely why this rule
 * was worth having: the migration rewrote `routes/` entirely and did not have
 * to touch a single file in `features/`.
 *
 * This is the load-bearing constraint of the whole restructure and the one the
 * suite had no rule for. Every other rule here is about where a file *sits*;
 * this one is about what a file *reaches*, which is the only thing that decides
 * whether the layering is real or just a folder naming convention.
 *
 * Written on archunit's `dependOnFiles`, which resolves the actual import graph
 * through the TypeScript program rather than matching text. That matters: a
 * content regex cannot follow `@/` path aliases to the file they land on, so it
 * would have to trust that the alias means what its name suggests. The graph
 * does not have to trust anything.
 *
 * Note what is *not* forbidden. `shared/` may be imported by anyone, and
 * `features/` may be imported by `routes/` freely. The rule only
 * bites in the other direction, where a lower layer reaching up would make the
 * lower one unusable without the higher one, which is exactly the coupling the
 * layer names promise does not exist.
 */

describe('layers only ever point downward', () => {
  /**
   * The positive control, and the reason this file can be trusted.
   *
   * Every assertion below is a negative: "no edges of this kind exist". A
   * negative passes just as happily when the analyzer resolved nothing at all
   * -- a broken tsconfig path, a moved folder, an archunit upgrade that changes
   * how `inFolder` globs -- and a suite of four silent negatives is the vacuous
   * -rule failure AD-9 exists to prevent.
   *
   * So this asserts an edge set that *must* be large: `routes/` importing
   * `features/` is the normal, intended direction. If this number collapses,
   * the three rules below are meaningless and this test says so before they
   * lie.
   */
  it('sees the import graph it claims to check', async () => {
    const routesToFeatures = await projectFiles()
      .inFolder('src/routes/**')
      .shouldNot()
      .dependOnFiles()
      .inFolder('src/features/**')
      .check();

    expect(routesToFeatures.length).toBeGreaterThanOrEqual(30);
  });

  it('shared does not reach features', async () => {
    const rule = projectFiles()
      .inFolder('src/shared/**')
      .shouldNot()
      .dependOnFiles()
      .inFolder('src/features/**');

    await expect(rule).toPassAsync();
  });

  it('shared does not reach routes', async () => {
    const rule = projectFiles()
      .inFolder('src/shared/**')
      .shouldNot()
      .dependOnFiles()
      .inFolder('src/routes/**');

    await expect(rule).toPassAsync();
  });

  // The one that keeps the domain reusable. A feature reaching into `routes/`
  // would pin it to a route, so moving the route would move the domain -- and
  // a framework migration, which rewrites `routes/` entirely, would take the
  // features with it. That is exactly what this migration did *not* have to
  // do, and the reason it did not is this rule.
  it('features do not reach routes', async () => {
    const rule = projectFiles()
      .inFolder('src/features/**')
      .shouldNot()
      .dependOnFiles()
      .inFolder('src/routes/**');

    await expect(rule).toPassAsync();
  });
});
