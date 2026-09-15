import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { translator } from '@/shared/i18n/intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';
import { ThemeSelector } from '@/shared/ui/components/theme-selector';

export const Route = createFileRoute('/_authenticated/settings/appearance')({
  head: () => {
    const t = translator('settings');
    return {
      meta: [
        { title: t('appearance.meta.title') },
        { name: 'description', content: t('appearance.meta.description') },
      ],
    };
  },
  component: AppearancePage,
});

function AppearancePage() {
  const t = useTranslations('settings');

  return (
    <>
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
          {t('appearance.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('appearance.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('appearance.theme')}</CardTitle>
          <CardDescription>{t('appearance.themeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>
    </>
  );
}
