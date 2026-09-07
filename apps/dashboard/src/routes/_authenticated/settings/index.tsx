import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/settings` is not a page, it is the first entry in its own nav.
 *
 * In `beforeLoad`, so the settings chrome never paints around an empty panel
 * on the way through.
 */
export const Route = createFileRoute('/_authenticated/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/tokens' });
  },
});
