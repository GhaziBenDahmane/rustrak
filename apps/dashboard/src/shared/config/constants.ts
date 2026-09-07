import packageJson from '../../../package.json';

/**
 * The dashboard's own version, as the About page reports it.
 *
 * Read out of `package.json` at build time, which is the same number the
 * server carries: `@rustrak/server`, `@rustrak/dashboard`, `@rustrak/client`
 * and `@rustrak/mcp` are a `fixed` changeset group precisely so that one
 * number identifies the Rustrak release rather than the semver of any single
 * artifact.
 *
 * They can still differ, and the About page shows both for that reason:
 * `VITE_RUSTRAK_API_URL` lets this bundle be served away from the server it
 * talks to.
 */
export const APP_VERSION = packageJson.version;
