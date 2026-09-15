import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The standalone `rustrak-ui` image keeps the properties the embedded
 * dashboard has, and configures itself at start rather than at build.
 *
 * The image exists for one deployment: the dashboard on a different host
 * from the server, which is where the old Next.js image was often run. It
 * only earns that place if the browser still talks to a single origin, so
 * nginx has to proxy the API rather than the bundle calling across origins,
 * and it has to be pointed at a server *after* it is built, or one image
 * could not serve two installations.
 *
 * None of this is reachable from a normal test; an image and an nginx
 * template are text, so the rules read them as text, the way every other
 * rule in this folder reads source.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) =>
  readFileSync(resolve(here, relative), 'utf8');

const dockerfile = () => read('../../../Dockerfile');
const template = () => read('../../../docker/nginx.conf.template');

/** Source files under `src/`, this folder excluded, that contain `needle`. */
function sourceMentioning(needle: string): string[] {
  const root = resolve(here, '../..');
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.startsWith('__tests__'))
    .filter((file) =>
      readFileSync(resolve(root, file), 'utf8').includes(needle),
    );
}

describe('the standalone dashboard image', () => {
  it('is pointed at its server at start, not at build', () => {
    // The nginx image's entrypoint runs envsubst over `/etc/nginx/templates/`
    // on every start. That is the mechanism, so the template has to name the
    // variable and the Dockerfile has to install it where the entrypoint
    // looks; a copy straight into `conf.d/` would ship the placeholder.
    expect(template()).toMatch(/\$\{RUSTRAK_API_URL\}/);
    expect(dockerfile()).toMatch(
      /COPY\s+\S*docker\/nginx\.conf\.template\s+\/etc\/nginx\/templates\//,
    );
    // Baking the server's address into the bundle is the other way to do it,
    // and the one that gives up the single origin: the browser would then call
    // the API cross-origin, where the `SameSite=Lax` session cookie does not
    // travel and nothing authenticated works. So there is no such variable to
    // bake, anywhere: not in the image, and not in the source that would read
    // it.
    expect(dockerfile()).not.toMatch(/VITE_RUSTRAK_API_URL/);
    expect(sourceMentioning('VITE_RUSTRAK_API_URL')).toEqual([]);
  });

  it('resolves the server name at request time, through the container DNS', () => {
    // `proxy_pass` with a variable, which is what a runtime `RUSTRAK_API_URL`
    // is, makes nginx resolve the host itself instead of at config load, and
    // nginx has no resolver unless told. Without one every proxied request is
    // a 502 with "no resolver defined" in the log, and the dashboard renders
    // its "server did not answer" screen against a server that is fine.
    //
    // The entrypoint exports the container's resolvers as
    // `NGINX_LOCAL_RESOLVERS` only when asked, hence the opt-in below.
    expect(template()).toMatch(/^\s*resolver \$\{NGINX_LOCAL_RESOLVERS\}/m);
    expect(dockerfile()).toMatch(/^ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=/m);
  });

  it('does not run nginx as root', () => {
    // `nginx-unprivileged` is the upstream image built for this: it listens
    // on an unprivileged port and never needs to drop privileges, so there is
    // no root at any point of the container's life.
    expect(dockerfile()).toMatch(/^FROM nginxinc\/nginx-unprivileged:/m);
  });
});

describe('the standalone dashboard image caches the way the server does', () => {
  it('marks hashed assets immutable and never answers a missing one with the shell', () => {
    const assets = /location \/assets\/ \{([^}]*)\}/.exec(template());
    expect(assets, 'no `location /assets/` block').not.toBeNull();
    // Vite fingerprints everything under `assets/`, which is the only reason a
    // year-long `immutable` is safe there and nowhere else.
    expect(assets?.[1]).toMatch(
      /Cache-Control "public, max-age=31536000, immutable"/,
    );
    // HTML under a `.js` URL is a syntax error that names the bundle instead
    // of the deploy that dropped it.
    expect(assets?.[1]).toMatch(/try_files \$uri =404;/);
  });

  it('answers every client route with a shell the browser must revalidate', () => {
    const root = /location \/ \{([^}]*)\}/.exec(template());
    expect(root, 'no `location /` block').not.toBeNull();
    expect(root?.[1]).toMatch(/try_files \$uri \/index\.html;/);
    // The shell names hashed bundles a deploy may have replaced. `no-cache`
    // keeps it revalidated; `no-store` would refetch it on every navigation.
    expect(root?.[1]).toMatch(/Cache-Control "no-cache"/);
  });
});
