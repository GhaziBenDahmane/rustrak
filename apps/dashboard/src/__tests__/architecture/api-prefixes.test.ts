import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The one list that exists twice, pinned so it cannot drift.
 *
 * A single-page application and a REST API share one origin here, and both
 * halves have to agree on where the boundary is. In production
 * `routes::dashboard` in the Rust server refuses to answer these prefixes with
 * the application shell; in development Vite proxies exactly these prefixes to
 * the server instead of letting the router claim them. **They are the same
 * list, written in two languages, and neither file can see the other.**
 *
 * Both ways they can disagree cost an afternoon:
 *
 * - A prefix in the server's list and not Vite's works in production and 404s
 *   in `vite dev` — the router answers with the shell, `@rustrak/client` parses
 *   HTML, and the error names a schema mismatch in the client itself.
 * - A prefix in Vite's list and not the server's works in development and
 *   breaks on deploy, in the same way, on a machine nobody is debugging.
 *
 * So the rule reads both files as text and compares. Reading text rather than
 * importing is deliberate: `vite.config.ts` is a config module with plugins to
 * evaluate, and `dashboard.rs` is Rust. Neither can be imported into a Vitest
 * process, and a rule that could only check the half it could load would be
 * the half that never drifts.
 */

const here = dirname(fileURLToPath(import.meta.url));

function read(relative: string): string {
  return readFileSync(resolve(here, relative), 'utf8');
}

/** `const apiPrefixes = ['/api', '/auth', ...]` in `vite.config.ts`. */
function viteProxyPrefixes(): string[] {
  const source = read('../../../vite.config.ts');
  const declaration = /const apiPrefixes = \[([^\]]*)\]/.exec(source);

  if (!declaration) {
    throw new Error(
      'vite.config.ts no longer declares `apiPrefixes`. It is half of the ' +
        'boundary between the router and the API; this rule cannot check it ' +
        'if it cannot find it.',
    );
  }

  return [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** `pub const API_PREFIXES: [&str; N] = ["/api", ...]` in `dashboard.rs`. */
function serverApiPrefixes(): string[] {
  const source = read('../../../../server/src/routes/dashboard.rs');
  const declaration =
    /pub const API_PREFIXES: \[&str; \d+\] = \[([^\]]*)\]/.exec(source);

  if (!declaration) {
    throw new Error(
      'apps/server/src/routes/dashboard.rs no longer declares ' +
        '`API_PREFIXES`. It is the other half of the boundary; this rule ' +
        'cannot check it if it cannot find it.',
    );
  }

  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('the API prefixes do not drift', () => {
  // The floor. Both readers throw on a missing declaration, but a regex that
  // matched an empty array would satisfy the equality below with two empty
  // lists and say nothing at all.
  it('reads a list from both sides', () => {
    expect(viteProxyPrefixes().length).toBeGreaterThanOrEqual(3);
    expect(serverApiPrefixes().length).toBeGreaterThanOrEqual(3);
  });

  it('proxies in development exactly what the server keeps in production', () => {
    // Sorted: the two files order them for readability, not for meaning, and a
    // rule that failed on the ordering would be noise the next person mutes.
    expect([...viteProxyPrefixes()].sort()).toEqual(
      [...serverApiPrefixes()].sort(),
    );
  });

  // Prefix *segments*: the server matches `path == prefix || path.starts_with("{prefix}/")`,
  // so a trailing slash here would make `/api` itself fall through to the shell.
  it('names each prefix as a path with no trailing slash', () => {
    for (const prefix of serverApiPrefixes()) {
      expect(prefix.startsWith('/')).toBe(true);
      expect(prefix.endsWith('/')).toBe(false);
    }
  });
});
