import type { CleanupCounts, ProjectStorage } from '@rustrak/client';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  estimateBytes,
  removedParts,
} from '@/features/storage/model/retention';
import { formatBytes } from '@/shared/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/components/shadcn/alert-dialog';
import { Button } from '@/shared/ui/components/shadcn/button';
import { DialogFooter } from '@/shared/ui/components/shadcn/dialog';

/**
 * What a retention draft deletes, and its three ways out: cancel, save for
 * the next cleanup, or save and clean up now (asked once more).
 */
export function RetentionFooter({
  impact,
  projects,
  isPending,
  onCancel,
  onSave,
}: {
  impact: CleanupCounts | null;
  projects: readonly ProjectStorage[];
  isPending: boolean;
  onCancel: () => void;
  onSave: (cleanNow: boolean) => void;
}) {
  const t = useTranslations('storage');
  const [confirming, setConfirming] = useState(false);
  const parts = impact ? removedParts(impact, t) : [];
  const size = impact ? formatBytes(estimateBytes(impact, projects)) : '';

  return (
    <>
      <p
        className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
        aria-live="polite"
      >
        {impact === null ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('dialog.counting')}
          </span>
        ) : parts.length > 0 ? (
          t('dialog.impact', { parts: parts.join(', '), size })
        ) : (
          <span className="text-muted-foreground">{t('dialog.noImpact')}</span>
        )}
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          {t('cancel')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={isPending || parts.length === 0}
        >
          {t('dialog.saveAndClean')}
        </Button>
        <Button onClick={() => onSave(false)} disabled={isPending}>
          {isPending && !confirming && <Loader2 className="animate-spin" />}
          {t('dialog.save')}
        </Button>
      </DialogFooter>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !isPending && setConfirming(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dialog.confirmTitle', { size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialog.confirmDescription', { parts: parts.join(', ') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => onSave(true)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="animate-spin" />}
              {t('dialog.confirmAction', { size })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
