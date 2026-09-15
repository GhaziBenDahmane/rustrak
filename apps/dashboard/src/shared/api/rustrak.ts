import { RustrakClient } from '@rustrak/client';

/**
 * The API base URL.
 *
 * `window.location.origin` is not a fallback, it is the design. The dashboard
 * is served by the same Actix process that answers `/api`, so in production
 * the origin *is* the server. In development Vite proxies the API prefixes to
 * it, so the origin is right there too — and because the request never leaves
 * the origin, the session cookie stays first-party and no CORS preflight is
 * involved in either environment.
 *
 * There is deliberately no override. A bundle hosted away from its server is
 * `apps/dashboard/Dockerfile`: nginx in front of the same files, proxying the
 * API prefixes, so the browser still talks to one origin. Calling the API
 * cross-origin instead would leave the `SameSite=Lax` session cookie behind.
 */
function baseUrl(): string {
  return window.location.origin;
}

/**
 * One client for the whole application.
 *
 * It holds configuration and a `ky` instance, nothing per-request and nothing
 * per-user: the session travels in a cookie the browser attaches itself. A
 * client per component would rebuild the retry and error-mapping layers on
 * every render for no gain.
 *
 * Built on first use rather than at import, and that is not a micro-
 * optimisation: `window` does not exist in the Node process that runs the
 * architecture rules and the portable-core tests, and a module that reads it
 * at import time cannot be loaded there at all.
 */
let client: RustrakClient | undefined;

/**
 * The client, as a promise.
 *
 * There is nothing to await any more — under Next this read the request's
 * cookies to build a per-request client, and in the browser the cookie is the
 * browser's business. The signature is kept because every `api/queries.ts` and
 * `api/mutations.ts` calls it exactly this way, and a synchronous rename would
 * have been a hundred-file diff that changed no behaviour.
 */
export async function createClient(): Promise<RustrakClient> {
  client ??= new RustrakClient({ baseUrl: baseUrl() });
  return client;
}
