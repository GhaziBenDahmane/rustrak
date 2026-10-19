import type { McpStatus } from '@rustrak/client';
import { Check, Copy, KeyRound, LogIn, TriangleAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import { updateMcpSettings } from '@/features/mcp/api/mutations';
import {
  type ConnectMethod,
  mcpSnippet,
  type SnippetClient,
} from '@/features/mcp/lib/snippets';
import { CodeBlock } from '@/shared/ui/components/code-block';
import { Link } from '@/shared/ui/components/link';
import { Badge } from '@/shared/ui/components/shadcn/badge';
import { Button } from '@/shared/ui/components/shadcn/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';
import { Switch } from '@/shared/ui/components/shadcn/switch';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/components/shadcn/tabs';
import { type CopyFlags, useCopyFlags } from '@/shared/ui/hooks/use-copy-flags';
import { useSyntaxHighlighter } from '@/shared/ui/hooks/use-syntax-highlighter';

interface McpSettingsProps {
  initial: McpStatus;
  isAdmin: boolean;
}

/**
 * The switch that opens `/mcp`, and the two ways to connect to it.
 *
 * The URL comes from the server, not this page's origin: OAuth checks the
 * resource against the configured `PUBLIC_URL`, which a dashboard on its own
 * host, or one opened by another name, does not share.
 */
export function McpSettings({ initial, isAdmin }: McpSettingsProps) {
  const t = useTranslations('settings');
  const [enabled, setEnabled] = useState(initial.enabled);
  const [isPending, startTransition] = useTransition();
  const copyFlags = useCopyFlags({
    unavailable: t('mcp.copyUnavailable'),
    hint: (label) => t('mcp.copyUnavailableHint', { label }),
  });
  const url = initial.url;

  const toggle = (next: boolean) => {
    setEnabled(next);
    startTransition(async () => {
      const result = await updateMcpSettings(next);
      if (!result.success) {
        setEnabled(!next);
        toast.error(t('mcp.server.updateFailed'), {
          description: result.error.message,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('mcp.server.title')}
            <Badge variant={enabled ? 'default' : 'outline'}>
              {enabled ? t('mcp.server.on') : t('mcp.server.off')}
            </Badge>
          </CardTitle>
          <CardDescription>
            {isAdmin ? t('mcp.server.description') : t('mcp.server.adminOnly')}
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <Switch
                checked={enabled}
                onCheckedChange={toggle}
                disabled={isPending}
                aria-label={t('mcp.server.toggleLabel')}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">{t('mcp.server.endpoint')}</p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code className="flex-1 truncate font-mono text-xs">{url}</code>
            <CopyButton
              flags={copyFlags}
              target="url"
              value={url}
              label={t('mcp.server.endpoint')}
            />
          </div>
          {!enabled && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <TriangleAlert className="size-3.5 shrink-0" />
              {t('mcp.server.offNotice')}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <MethodCard method="oauth" url={url} copyFlags={copyFlags} />
        <MethodCard method="token" url={url} copyFlags={copyFlags} />
      </div>
    </div>
  );
}

/** The tabs each way in offers: signing in also covers the web apps. */
const TABS: Record<ConnectMethod, readonly (SnippetClient | 'web')[]> = {
  oauth: ['web', 'claudeCode', 'json'],
  token: ['claudeCode', 'json'],
};

function MethodCard({
  method,
  url,
  copyFlags,
}: {
  method: ConnectMethod;
  url: string;
  copyFlags: CopyFlags;
}) {
  const t = useTranslations('settings');
  const Icon = method === 'oauth' ? LogIn : KeyRound;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {t(`mcp.${method}.title`)}
          {method === 'oauth' && (
            <Badge variant="secondary">{t('mcp.oauth.recommended')}</Badge>
          )}
        </CardTitle>
        <CardDescription>{t(`mcp.${method}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t(`mcp.${method}.clients`)}
        </p>
        <ol className="space-y-2 text-sm">
          {(['step1', 'step2', 'step3'] as const).map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {i + 1}
              </span>
              <span>
                {method === 'token' && step === 'step1' ? (
                  <>
                    {t('mcp.token.step1')}{' '}
                    <Link
                      href="/settings/tokens"
                      className="text-primary hover:underline"
                    >
                      {t('mcp.token.createToken')}
                    </Link>
                  </>
                ) : (
                  t(`mcp.${method}.${step}`)
                )}
              </span>
            </li>
          ))}
        </ol>
        <ClientGuide method={method} url={url} copyFlags={copyFlags} />
        <p className="text-xs text-muted-foreground">
          {t(`mcp.${method}.note`)}
        </p>
      </CardContent>
    </Card>
  );
}

/** One tab per client: the web apps get steps, the rest a snippet to paste. */
function ClientGuide({
  method,
  url,
  copyFlags,
}: {
  method: ConnectMethod;
  url: string;
  copyFlags: CopyFlags;
}) {
  const t = useTranslations('settings');
  const { resolvedTheme } = useTheme();
  const highlighter = useSyntaxHighlighter(resolvedTheme === 'dark');
  const tabs = TABS[method];
  const [tab, setTab] = useState(tabs[0]);
  const snippet = tab === 'web' ? null : mcpSnippet(method, tab, url);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
        >
          <TabsList className="h-8 bg-transparent">
            {tabs.map((id) => (
              <TabsTrigger key={id} value={id} className="h-7 px-2.5 text-xs">
                {t(`mcp.clients.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {snippet && (
          <CopyButton
            flags={copyFlags}
            target={`${method}-${tab}`}
            value={snippet.code}
            label={t(`mcp.clients.${tab}`)}
            withText
          />
        )}
      </div>
      {snippet ? (
        <div className="overflow-x-auto">
          <CodeBlock
            code={snippet.code}
            language={snippet.language}
            highlighter={highlighter}
          />
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          {t('mcp.clients.webSteps')}
        </p>
      )}
    </div>
  );
}

function CopyButton({
  flags,
  target,
  value,
  label,
  withText = false,
}: {
  flags: CopyFlags;
  target: string;
  value: string;
  label: string;
  withText?: boolean;
}) {
  const t = useTranslations('settings');
  const copied = flags.isCopied(target);

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => flags.copy(target, value, label)}
      aria-label={t('mcp.copyLabel', { label })}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
      {withText && (copied ? t('mcp.copied') : t('mcp.copy'))}
    </Button>
  );
}
