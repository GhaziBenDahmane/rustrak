/**
 * The 0.15 release candidate announcement, in one place.
 *
 * Two surfaces show it: the docs shell (through Nextra's `Banner`, which
 * knows how to make room for itself under the theme's navbar) and the
 * landing (through `ReleaseCandidateBanner`, because the landing is outside
 * the docs layout). They share the text, the link and the storage key, so a
 * reader who dismisses one has dismissed both.
 *
 * Remove the folder when 0.15 ships; see `(docs)/layout.tsx`.
 */

/** Bump when the wording changes enough that everyone should see it again. */
export const RC_STORAGE_KEY = 'rustrak-0-15-rc';

export const RC_HREF = '/getting-started/try-0-15';

export const RC_LABEL = 'Rustrak 0.15 RC';

export const RC_TEXT = 'One container now serves the dashboard and the API.';

export const RC_CALL = 'Try it and see how to migrate';
