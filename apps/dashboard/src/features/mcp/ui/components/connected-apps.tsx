import type { OAuthGrant } from '@rustrak/client';
import { Unplug } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useFormatter, useTranslations } from 'use-intl';
import { revokeConnection } from '@/features/mcp/api/mutations';
import { Button } from '@/shared/ui/components/shadcn/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/components/shadcn/table';

/** The host a client is published from, which is what a reader recognises. */
function clientHost(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

/**
 * The assistants connected to the reader's account by signing in, and the
 * one control that matters for each: cutting it off.
 */
export function ConnectedApps({ initial }: { initial: OAuthGrant[] }) {
  const t = useTranslations('settings');
  const format = useFormatter();
  const [grants, setGrants] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const revoke = (grant: OAuthGrant) => {
    startTransition(async () => {
      const result = await revokeConnection(grant.id);
      if (!result.success) {
        toast.error(t('mcp.connected.revokeFailed'), {
          description: result.error.message,
        });
        return;
      }
      setGrants((prev) => prev.filter((g) => g.id !== grant.id));
      toast.success(t('mcp.connected.revoked', { name: grant.client_name }));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mcp.connected.title')}</CardTitle>
        <CardDescription>{t('mcp.connected.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {grants.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <Unplug className="mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t('mcp.connected.empty')}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('mcp.connected.columns.name')}</TableHead>
                  <TableHead>{t('mcp.connected.columns.client')}</TableHead>
                  <TableHead>{t('mcp.connected.columns.since')}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium">
                      {grant.client_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {clientHost(grant.client_id)}
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(grant.created_at), 'date')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => revoke(grant)}
                        aria-label={t('mcp.connected.revokeLabel', {
                          name: grant.client_name,
                        })}
                      >
                        {t('mcp.connected.revoke')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
