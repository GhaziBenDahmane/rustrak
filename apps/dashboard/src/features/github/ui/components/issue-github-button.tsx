import type { IssueLink, Result, RustrakError } from '@rustrak/client';
import { ChevronDown, Link2, Loader2, Plus, Unlink } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  createGitHubIssue,
  linkGitHubIssue,
  unlinkGitHubIssue,
} from '@/features/github/api/mutations';
import { cn } from '@/shared/lib/utils';
import { GitHubMark } from '@/shared/ui/components/github-mark';
import { Button, buttonVariants } from '@/shared/ui/components/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu';
import { Input } from '@/shared/ui/components/shadcn/input';
import { useRouter } from '@/shared/ui/hooks/use-router';

interface IssueGitHubButtonProps {
  projectId: number;
  issueId: string;
  links: IssueLink[];
  /** False once the project's repository is gone: links stay, new ones can't. */
  canLink?: boolean;
}

/**
 * The issue's way to GitHub, in the toolbar beside resolve and archive. Each
 * linked issue is a chip that opens it; the menu creates or links another.
 */
export function IssueGitHubButton({
  projectId,
  issueId,
  links,
  canLink = true,
}: IssueGitHubButtonProps) {
  const t = useTranslations('github');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [linking, setLinking] = useState(false);
  const [reference, setReference] = useState('');

  const run = (
    failure: string,
    action: () => Promise<Result<unknown, RustrakError>>,
    after?: () => void,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(failure, { description: result.error.message });
        return;
      }
      after?.();
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={`${link.repo_full_name}#${link.number} · ${link.title} · ${
            link.state === 'closed' ? t('issue.closed') : t('issue.open')
          }`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <GitHubMark className="size-3.5" />#{link.number}
          <span
            className={cn(
              'size-1.5 rounded-full',
              link.state === 'closed' ? 'bg-purple-500' : 'bg-green-500',
            )}
          />
        </a>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              aria-label={t('issue.menu')}
            />
          }
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            links.length === 0 && <GitHubMark className="size-3.5" />
          )}
          {links.length === 0 && 'GitHub'}
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {canLink && (
            <>
              <DropdownMenuItem
                onClick={() =>
                  run(t('issue.createFailed'), () =>
                    createGitHubIssue(projectId, issueId),
                  )
                }
              >
                <Plus className="mr-2 size-4" />
                {t('issue.create')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLinking(true)}>
                <Link2 className="mr-2 size-4" />
                {t('issue.link')}
              </DropdownMenuItem>
            </>
          )}
          {canLink && links.length > 0 && <DropdownMenuSeparator />}
          {links.map((link) => (
            <DropdownMenuItem
              key={link.id}
              onClick={() =>
                run(t('issue.unlinkFailed'), () =>
                  unlinkGitHubIssue(projectId, issueId, link.id),
                )
              }
            >
              <Unlink className="mr-2 size-4" />
              {t('issue.unlink', { number: link.number })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                t('issue.linkFailed'),
                () => linkGitHubIssue(projectId, issueId, reference.trim()),
                () => {
                  setLinking(false);
                  setReference('');
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('issue.linkTitle')}</DialogTitle>
              <DialogDescription>
                {t('issue.linkDescription')}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="#123"
              aria-label={t('issue.linkTitle')}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending || !reference.trim()}>
                {t('issue.linkSubmit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
