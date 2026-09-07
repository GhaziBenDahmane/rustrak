import { useTranslations } from 'use-intl';
import { ErrorScreen } from '@/shared/ui/components/error-screen';
import { Link } from '@/shared/ui/components/link';
import { Button } from '@/shared/ui/components/shadcn/button';

/**
 * The one 404 for every route.
 *
 * It covers both an unmatched URL and every missing record the application
 * finds for itself — a project id that does not exist, a deleted issue, a
 * release with no rows, or `LoadFailure` turning a `not_found` into the app's
 * 404. Because it is the only one, it replaces the header for a signed-in
 * reader too, which is why the action below is not decoration: it is the only
 * way back.
 *
 * It is a component rather than a route so that `LoadFailure` can render it in
 * place. Next raised `notFound()` and the framework swapped the tree; here the
 * two callers — the router's `notFoundComponent` and `LoadFailure` — render
 * the same element, which is the only way they stay identical.
 */
export function NotFoundScreen() {
  const t = useTranslations('errors');

  return (
    <ErrorScreen
      brandStatement={t('notFound.brandStatement')}
      brandDescription={t('notFound.brandDescription')}
      headline={t('notFound.headline')}
      description={t('notFound.description')}
      guidance={t('notFound.guidance')}
      actions={
        <Button nativeButton={false} render={<Link href="/projects" />}>
          {t('goToProjects')}
        </Button>
      }
    />
  );
}
