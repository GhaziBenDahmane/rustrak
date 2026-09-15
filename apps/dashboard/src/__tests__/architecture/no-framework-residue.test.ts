import { projectFiles } from 'archunit';
import { describe, expect, it } from 'vitest';
import { isTestFile, withoutComments } from './predicates';

/**
 * Nothing here imports Next any more, and nothing here is a Server Action.
 *
 * **This replaces `use-server-placement`, which enforced the rule this app no
 * longer has.** That rule said a `'use server'` directive belongs in
 * `api/mutations.ts` and nowhere else, because a stray one turns every exported
 * function in its file into a public POST endpoint. There is no server in this
 * process to expose one to, so the directive is not misplaced here — it is
 * meaningless, and a meaningless directive left in a file is worse than a
 * misplaced one, because it reads as a claim about how the code runs.
 *
 * What is worth pinning instead is that the migration is finished. Both halves
 * are things a copy-paste from the old app, or an answer from a model trained
 * on it, reintroduces without anyone noticing:
 *
 * - `next/*` still resolves as long as `next` is in some lockfile, so an
 *   `import Link from 'next/link'` type-checks in an editor and fails at build.
 * - `'use client'` and `'use server'` are inert strings. Nothing errors. They
 *   just accumulate, and the next reader has to work out which of them means
 *   something.
 *
 * `next-themes` is not Next. It is a plain React provider whose name predates
 * its portability, it is the same package the Next app used, and swapping it
 * would change how the theme is stored — which is a visible change, and not
 * one this migration is making.
 */

/** `next/link`, `next/navigation`, `next` itself. Not `next-themes`. */
const NEXT_IMPORT = /(?:from|import)\s+['"]next(?:\/[^'"]*)?['"]/;

/** A directive, which is a string literal alone on a line at the top. */
const RSC_DIRECTIVE = /^\s*['"]use (?:client|server)['"];?\s*$/m;

describe('nothing is left of the framework that was replaced', () => {
  /**
   * The floor.
   *
   * Both assertions are negatives over a predicate archunit cannot see inside,
   * so an empty population would pass them both while checking nothing. This
   * counts the files they judge.
   */
  it('reads the population it expects to read', async () => {
    const source = await projectFiles()
      .inFolder('src/**')
      .shouldNot()
      .adhereTo((file) => !isTestFile(file.path), 'counted')
      .check();

    expect(source.length).toBeGreaterThanOrEqual(250);
  });

  it('has no file importing from next', async () => {
    const rule = projectFiles()
      .inFolder('src/**')
      .shouldNot()
      .adhereTo(
        (file) =>
          !isTestFile(file.path) &&
          // Comments are blanked first, so the paragraphs above -- which name
          // `next/link` while explaining the rule -- do not trip it.
          NEXT_IMPORT.test(withoutComments(file.content)),
        'imports from next: the dashboard is a Vite SPA, and the import resolves in an editor while failing at build',
      );

    await expect(rule).toPassAsync();
  });

  it('has no leftover React Server Components directive', async () => {
    const rule = projectFiles()
      .inFolder('src/**')
      .shouldNot()
      .adhereTo(
        (file) =>
          !isTestFile(file.path) &&
          RSC_DIRECTIVE.test(withoutComments(file.content)),
        "carries a 'use client' or 'use server' directive, which is inert here and reads as a claim about how the file runs",
      );

    await expect(rule).toPassAsync();
  });
});
