/**
 * An assistant's authorization request, held across a sign-in.
 *
 * `/oauth/authorize` needs a session, and both ways in -- password and SSO --
 * land on `/` afterwards. The consent page leaves its own address in
 * `sessionStorage` under this key before sending the reader to `/login`, and
 * `/` resumes it.
 */
export const PENDING_AUTHORIZATION_KEY = 'rustrak.pendingAuthorization';

/**
 * The stored address, if it is one the app may resume.
 *
 * Only a consent page qualifies. Anything else in storage is not ours to
 * follow, and following it would turn `/` into an open redirect.
 */
export function resumableAuthorization(
  stored: string | null | undefined,
): string | undefined {
  return stored?.startsWith('/oauth/authorize?') ? stored : undefined;
}
