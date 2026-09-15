import { createFileRoute, redirect } from '@tanstack/react-router';
import { session } from '@/shared/api/session';
import { OutageScreen } from '@/shared/ui/components/outage-screen';

/**
 * The front door, which is not a page.
 *
 * It sits outside `_authenticated`, so it has no gate above it and owns the
 * whole decision. `anonymous` is the only state that means "log in"; an
 * unreachable server renders instead, because bouncing a dropped connection to
 * `/login` starts a loop that logging in cannot end.
 *
 * The decision is made in `beforeLoad` rather than in the component so that
 * nothing paints first: a redirect from inside a component has already drawn
 * the thing it was about to leave.
 */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const answer = await session.ensure();

    if (answer.state === 'anonymous') {
      throw redirect({ to: '/login' });
    }

    if (answer.state === 'authenticated') {
      // `href`, not `to`: `/projects` carries an optional `page`, and the
      // typed form would make this state a search object the route is happy
      // without — writing `?page=1` into an address that never had one.
      throw redirect({ href: '/projects' });
    }

    return { error: answer.error };
  },
  component: Outage,
});

function Outage() {
  const { error } = Route.useRouteContext();
  return <OutageScreen error={error} />;
}
