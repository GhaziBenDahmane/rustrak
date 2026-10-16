import type { GitHubStatus } from '@rustrak/client';
import { ArrowUpRight, Code, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useFormatter, useTranslations } from 'use-intl';
import { disconnectGitHub, getManifest } from '@/features/github/api/mutations';
import { unreachableFromGitHub } from '@/features/github/lib/webhook-url';
import { cn } from '@/shared/lib/utils';
import { GitHubMark } from '@/shared/ui/components/github-mark';
import {
  IntegrationSection,
  IntegrationTile,
} from '@/shared/ui/components/integration-section';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/components/shadcn/alert-dialog';
import { Badge } from '@/shared/ui/components/shadcn/badge';
import { Button, buttonVariants } from '@/shared/ui/components/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog';
import { Input } from '@/shared/ui/components/shadcn/input';
import { useRouter } from '@/shared/ui/hooks/use-router';

/**
 * Posts the manifest to GitHub the only way GitHub accepts it: a form the
 * browser submits, so GitHub can show its own "Create GitHub App" page.
 */
function submitManifest(actionUrl: string, manifest: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = actionUrl;
  const field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'manifest';
  field.value = manifest;
  form.appendChild(field);
  document.body.appendChild(form);
  form.submit();
}

/**
 * Where code hosts and issue trackers live on the integrations page, laid out
 * like the alert providers above it. GitHub is the only tile for now.
 */
export function CodeIntegrations({ status }: { status: GitHubStatus }) {
  const t = useTranslations('github');
  const tAlerts = useTranslations('alerts');
  const [open, setOpen] = useState(false);
  const { app, installations } = status;
  const installed = installations.length > 0;

  return (
    <IntegrationSection
      icon={<Code className="size-4" />}
      iconClassName="bg-violet-500/10 text-violet-500"
      title={t('section.title')}
      description={t('section.description')}
      badge={
        installed
          ? tAlerts('integrations.configuredCount', { count: 1 })
          : undefined
      }
    >
      <IntegrationTile
        icon={<GitHubMark className="size-5" />}
        color="bg-[#24292f]"
        name="GitHub"
        description={
          installed
            ? installations.map((i) => i.account_login).join(', ')
            : t('connection.description')
        }
        status={
          installed
            ? tAlerts('integrations.connected')
            : app
              ? t('connection.notInstalled')
              : tAlerts('integrations.notConfigured')
        }
        connected={installed}
        empty={!app}
        action={
          app
            ? tAlerts('integrations.manage')
            : tAlerts('integrations.configure')
        }
        ariaLabel={tAlerts('integrations.configureAria', { name: 'GitHub' })}
        onOpen={() => setOpen(true)}
      />
      <GitHubDialog status={status} open={open} onOpenChange={setOpen} />
    </IntegrationSection>
  );
}

/**
 * The instance's GitHub connection, in three steps a person can see: create
 * the app, install it on an account, receive its webhooks.
 */
function GitHubDialog({
  status,
  open,
  onOpenChange,
}: {
  status: GitHubStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('github');
  const format = useFormatter();
  const router = useRouter();
  const [organization, setOrganization] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { app, installations } = status;

  const connect = () => {
    startTransition(async () => {
      const result = await getManifest(organization.trim() || undefined);
      if (!result.success) {
        toast.error(t('connection.connectFailed'), {
          description: result.error.message,
        });
        return;
      }
      submitManifest(result.data.action_url, result.data.manifest);
    });
  };

  const disconnect = () => {
    startTransition(async () => {
      const result = await disconnectGitHub();
      if (!result.success) {
        toast.error(t('connection.disconnectFailed'), {
          description: result.error.message,
        });
        return;
      }
      setConfirming(false);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded flex items-center justify-center text-white shrink-0 bg-[#24292f]">
              <GitHubMark className="size-4.5" />
            </div>
            <div>
              <DialogTitle>GitHub</DialogTitle>
              <DialogDescription>
                {t('connection.description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {app ? (
          <>
            <div className="divide-y rounded-lg border text-sm">
              <Row label={t('connection.app')}>
                <a
                  href={app.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:underline"
                >
                  {app.slug}
                  <ArrowUpRight className="size-3.5" />
                </a>
              </Row>

              <Row label={t('connection.accounts')}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {installations.map((installation) => (
                    <Badge key={installation.id} variant="secondary">
                      {installation.account_login}
                      {installation.suspended &&
                        ` · ${t('connection.suspended')}`}
                    </Badge>
                  ))}
                  <a
                    href={app.install_url}
                    className={cn(
                      buttonVariants({
                        variant: installations.length ? 'outline' : 'default',
                        size: 'sm',
                      }),
                    )}
                  >
                    {t('connection.install')}
                  </a>
                </div>
              </Row>

              <Row label={t('connection.webhooks')}>
                {app.last_webhook_at ? (
                  <span className="text-muted-foreground">
                    {t('connection.lastWebhook', {
                      when: format.relativeTime(new Date(app.last_webhook_at)),
                    })}
                  </span>
                ) : unreachableFromGitHub(status.webhook_url) ? (
                  <span className="text-amber-600 dark:text-amber-500 text-xs text-right">
                    {t('connection.unreachable', { url: status.webhook_url })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t('connection.noWebhook')}
                  </span>
                )}
              </Row>
            </div>

            <DialogFooter>
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() => setConfirming(true)}
              >
                {t('connection.disconnect')}
              </Button>
            </DialogFooter>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('connection.disconnectTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('connection.disconnectDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>
                    {t('cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={disconnect}
                    disabled={isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('connection.disconnect')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
          >
            <p className="text-sm text-muted-foreground">
              {t('connection.intro')}
            </p>
            <label
              htmlFor="github-organization"
              className="block text-sm font-medium"
            >
              {t('connection.organizationLabel')}
            </label>
            <Input
              id="github-organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder={t('connection.organizationPlaceholder')}
              disabled={isPending}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GitHubMark className="size-4" />
                )}
                {t('connection.connect')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}
