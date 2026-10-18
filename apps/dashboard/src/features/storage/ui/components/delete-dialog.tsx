import type {
  CleanupCounts,
  CleanupStatus,
  ProjectStorage,
} from '@rustrak/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  executeStorageCleanup,
  previewStorageCleanup,
} from '@/features/storage/api/mutations';
import {
  estimateBytes,
  KINDS,
  type Kind,
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
import { Checkbox } from '@/shared/ui/components/shadcn/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/shadcn/select';

const OLDER_THAN = [1, 7, 14, 30, 90, 180, 365] as const;
const ALL = 'all';

/**
 * Deletes data now, without waiting for the cleanup: which kinds, older
 * than what, in every project or one. What goes is counted as it is
 * chosen, and the button says how much.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  projects,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly ProjectStorage[];
  onStarted: (job: CleanupStatus) => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => !isPending && onOpenChange(o)}
    >
      <AlertDialogContent className="sm:max-w-lg">
        {open && (
          <Editor
            projects={projects}
            isPending={isPending}
            startTransition={startTransition}
            onStarted={(job) => {
              onStarted(job);
              onOpenChange(false);
            }}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Editor({
  projects,
  isPending,
  startTransition,
  onStarted,
}: {
  projects: readonly ProjectStorage[];
  isPending: boolean;
  startTransition: (run: () => Promise<void>) => void;
  onStarted: (job: CleanupStatus) => void;
}) {
  const t = useTranslations('storage');
  const [kinds, setKinds] = useState<Kind[]>([...KINDS]);
  const [days, setDays] = useState(90);
  const [project, setProject] = useState(ALL);
  const [counts, setCounts] = useState<CleanupCounts | null>(null);

  const options = {
    older_than_days: days,
    project_id: project === ALL ? undefined : Number(project),
    include_events: kinds.includes('events'),
    include_transactions: kinds.includes('transactions'),
    include_logs: kinds.includes('logs'),
  };
  const key = JSON.stringify(options);

  // Counts what the choice deletes, as it changes.
  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    const timer = setTimeout(async () => {
      const result = await previewStorageCleanup(JSON.parse(key));
      if (!cancelled && result.success) setCounts(result.data);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const rows = counts ? KINDS.reduce((sum, k) => sum + counts[k], 0) : 0;
  const parts = counts ? removedParts(counts, t) : [];
  const size = counts ? formatBytes(estimateBytes(counts, projects)) : '';
  const byName = [...projects].sort((a, b) =>
    a.project_name.localeCompare(b.project_name),
  );

  const run = () =>
    startTransition(async () => {
      const result = await executeStorageCleanup(options);
      if (!result.success) {
        toast.error(t('toasts.cleanupFailed'), {
          description:
            result.error.kind === 'conflict'
              ? t('dialog.alreadyRunning')
              : undefined,
        });
        return;
      }
      onStarted(result.data);
    });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('delete.description')}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">
          {t('delete.what')}
        </legend>
        {KINDS.map((kind) => (
          <label
            key={kind}
            className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1.5"
          >
            <Checkbox
              className="mt-0.5"
              checked={kinds.includes(kind)}
              onCheckedChange={(checked) =>
                setKinds((ks) =>
                  checked ? [...ks, kind] : ks.filter((k) => k !== kind),
                )
              }
              disabled={isPending}
            />
            <span>
              <span className="block text-sm">{t(`kind.${kind}`)}</span>
              <span className="block text-xs text-muted-foreground">
                {t(`kindHint.${kind}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t('delete.olderThan')}</span>
          <Select
            value={String(days)}
            onValueChange={(v) => v && setDays(Number(v))}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => t('keep.days', { count: Number(v) })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OLDER_THAN.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t('keep.days', { count: d })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t('delete.in')}</span>
          <Select
            value={project}
            onValueChange={(v) => v && setProject(v)}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? t('delete.allProjects')
                    : (byName.find((p) => String(p.project_id) === v)
                        ?.project_name ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('delete.allProjects')}</SelectItem>
              {byName.map((p) => (
                <SelectItem key={p.project_id} value={String(p.project_id)}>
                  {p.project_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <p
        className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
        aria-live="polite"
      >
        {kinds.length === 0 ? (
          <span className="text-muted-foreground">{t('delete.pickOne')}</span>
        ) : counts === null ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('dialog.counting')}
          </span>
        ) : parts.length > 0 ? (
          t('delete.impact', { parts: parts.join(', '), size })
        ) : (
          <span className="text-muted-foreground">{t('delete.nothing')}</span>
        )}
      </p>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          {t('cancel')}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          onClick={run}
          disabled={isPending || rows === 0 || kinds.length === 0}
        >
          {isPending && <Loader2 className="animate-spin" />}
          {rows > 0 ? t('delete.action', { size }) : t('delete.actionIdle')}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
