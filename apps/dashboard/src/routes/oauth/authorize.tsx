import type { AuthorizationRequest } from '@rustrak/client';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { getAuthorization } from '@/features/mcp/api/queries';
import { PENDING_AUTHORIZATION_KEY } from '@/features/mcp/lib/pending-authorization';
import { ConsentForm } from '@/features/mcp/ui/components/consent-form';
import { session } from '@/shared/api/session';
import { translator } from '@/shared/i18n/intl';
import { OutageScreen } from '@/shared/ui/components/outage-screen';
import { RustrakWordmark } from '@/shared/ui/components/rustrak-wordmark';

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const optional = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

/**
 * `/oauth/authorize`, the authorization endpoint the server advertises: where
 * an assistant such as claude.ai sends the user to approve its access to
 * `/mcp`.
 *
 * Outside `_authenticated`, because a signed-out visitor must come back here
 * after signing in rather than land on `/projects`: the address is left in
 * `sessionStorage` and `/` resumes it, whichever way the sign-in went.
 */
export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: (search: Record<string, unknown>): AuthorizationRequest => ({
    response_type: text(search.response_type),
    client_id: text(search.client_id),
    redirect_uri: text(search.redirect_uri),
    code_challenge: text(search.code_challenge),
    code_challenge_method: text(search.code_challenge_method),
    state: optional(search.state),
    resource: optional(search.resource),
  }),
  beforeLoad: async ({ location }) => {
    const answer = await session.ensure();
    if (answer.state === 'anonymous') {
      try {
        sessionStorage.setItem(PENDING_AUTHORIZATION_KEY, location.href);
      } catch {
        // Storage refused (private mode): signing in lands on the projects
        // list instead, and the assistant can simply start over.
      }
      throw redirect({ to: '/login' });
    }
    return { answer };
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) =>
    context.answer.state === 'authenticated' ? getAuthorization(deps) : null,
  head: () => ({ meta: [{ title: translator('oauth')('meta.title') }] }),
  component: AuthorizePage,
});

function AuthorizePage() {
  const t = useTranslations('oauth');
  const { answer } = Route.useRouteContext();
  const request = Route.useSearch();
  const client = Route.useLoaderData();

  if (answer.state === 'unavailable') {
    return <OutageScreen error={answer.error} />;
  }

  return (
    <div className="min-h-screen bg-card flex items-center justify-center p-8 lg:p-12">
      <div className="w-full max-w-[460px] space-y-10">
        <RustrakWordmark className="h-[22px] w-auto" />

        {client?.success && answer.state === 'authenticated' ? (
          <ConsentForm
            request={request}
            client={client.data}
            email={answer.user.email}
          />
        ) : (
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {t('failedTitle')}
            </h1>
            <p className="text-muted-foreground">{t('failedDescription')}</p>
            {client && !client.success && (
              <p className="text-sm font-mono text-muted-foreground">
                {client.error.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
