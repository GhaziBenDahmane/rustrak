import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import { setMyGitHubLogin } from '@/features/github/api/mutations';
import { Button } from '@/shared/ui/components/shadcn/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';
import { Input } from '@/shared/ui/components/shadcn/input';

/** The person's GitHub username, which is how assignees cross over. */
export function GitHubLoginCard({ login }: { login: string | null }) {
  const t = useTranslations('github');
  const [value, setValue] = useState(login ?? '');
  const [saved, setSaved] = useState(login ?? '');
  const [isPending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await setMyGitHubLogin(value.trim() || null);
      if (!result.success) {
        toast.error(t('account.saveFailed'), {
          description: result.error.message,
        });
        return;
      }
      setValue(result.data.login ?? '');
      setSaved(result.data.login ?? '');
      toast.success(t('account.saved'));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.title')}</CardTitle>
        <CardDescription>{t('account.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2 max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="octocat"
            aria-label={t('account.title')}
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending || value.trim() === saved}>
            {t('save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
