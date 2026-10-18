import type {
  CleanupCounts,
  CleanupOptions,
  CleanupStatus,
  ProjectStorage,
  SourceMapGcResult,
} from '@rustrak/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  executeStorageCleanup,
  gcStorageSourceMaps,
  previewStorageCleanup,
  previewStorageSourceMapGc,
} from '@/features/storage/api/mutations';
import {
  estimateBytes,
  impactState,
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
import { ImpactLine } from './impact-line';

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
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly ProjectStorage[];
  onStarted: (job: CleanupStatus) => void;
  /** Reads the page again after a deletion that was not a job. */
  onChanged: () => void;
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
            onDone={(job) => {
              if (job) onStarted(job);
              else onChanged();
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
  onDone,
}: {
  projects: readonly ProjectStorage[];
  isPending: boolean;
  startTransition: (run: () => Promise<void>) => void;
  /** With the started job, or `null` when only source maps went. */
  onDone: (job: CleanupStatus | null) => void;
}) {
  const t = useTranslations('storage');
  const [kinds, setKinds] = useState<Kind[]>([...KINDS]);
  const [sourceMaps, setSourceMaps] = useState(true);
  const [days, setDays] = useState(90);
  const [project, setProject] = useState(ALL);

  const options = {
    older_than_days: days,
    project_id: project === ALL ? undefined : Number(project),
    include_events: kinds.includes('events'),
    include_transactions: kinds.includes('transactions'),
    include_logs: kinds.includes('logs'),
  };

  const nothingChosen = kinds.length === 0 && !sourceMaps;
  const { state, maps, rows, parts, size, retry } = useDeletion(
    options,
    { rows: kinds.length > 0, sourceMaps },
    projects,
  );

  const run = () =>
    startTransition(async () => {
      const done = await deleteNow(options, { maps, rows, parts }, t);
      if (done !== undefined) onDone(done);
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
          <Choice
            key={kind}
            checked={kinds.includes(kind)}
            onChange={(checked) =>
              setKinds((ks) =>
                checked ? [...ks, kind] : ks.filter((k) => k !== kind),
              )
            }
            title={t(`kind.${kind}`)}
            hint={t(`kindHint.${kind}`)}
            disabled={isPending}
          />
        ))}
        <Choice
          checked={sourceMaps}
          onChange={setSourceMaps}
          title={t('delete.sourceMaps')}
          hint={t('delete.sourceMapsHint')}
          disabled={isPending}
        />
      </fieldset>

      <Scope
        days={days}
        onDays={setDays}
        project={project}
        onProject={setProject}
        projects={projects}
        disabled={isPending}
      />

      <ImpactLine
        state={nothingChosen ? 'ready' : state}
        sentence={
          !nothingChosen && parts.length > 0
            ? t('delete.impact', { parts: parts.join(', '), size })
            : null
        }
        nothing={t(nothingChosen ? 'delete.pickOne' : 'delete.nothing')}
        onRetry={retry}
      />

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          {t('cancel')}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          onClick={run}
          disabled={
            isPending || state !== 'ready' || (rows === 0 && maps === 0)
          }
        >
          {isPending && <Loader2 className="animate-spin" />}
          {rows > 0 || maps > 0
            ? t('delete.action', { size })
            : t('delete.actionIdle')}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** A kind to delete: a checkbox, its name and what it covers. */
function Choice({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1.5">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled}
      />
      <span>
        <span className="block text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Deletes what was chosen: the unused source maps first (quick, no job),
 * then the data in the background. Resolves to the started job, `null` when
 * only source maps went, or `undefined` when it failed (already said with a
 * toast).
 */
async function deleteNow(
  options: CleanupOptions,
  chosen: { maps: number; rows: number; parts: string[] },
  t: (key: string, values?: Record<string, string | number>) => string,
): Promise<CleanupStatus | null | undefined> {
  if (chosen.maps > 0) {
    const gc = await gcStorageSourceMaps();
    if (!gc.success) {
      toast.error(t('toasts.gcFailed'));
      return undefined;
    }
  }
  if (chosen.rows === 0) {
    toast.success(t('toasts.removed', { parts: chosen.parts.join(', ') }));
    return null;
  }
  const result = await executeStorageCleanup(options);
  if (result.success) return result.data;
  toast.error(t('toasts.cleanupFailed'), {
    description:
      result.error.kind === 'conflict' ? t('dialog.alreadyRunning') : undefined,
  });
  return undefined;
}

/** How old, and where: the two choices that narrow a deletion. */
function Scope({
  days,
  onDays,
  project,
  onProject,
  projects,
  disabled,
}: {
  days: number;
  onDays: (days: number) => void;
  project: string;
  onProject: (project: string) => void;
  projects: readonly ProjectStorage[];
  disabled?: boolean;
}) {
  const t = useTranslations('storage');
  const byName = [...projects].sort((a, b) =>
    a.project_name.localeCompare(b.project_name),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">{t('delete.olderThan')}</span>
        <Select
          value={String(days)}
          onValueChange={(v) => v && onDays(Number(v))}
          disabled={disabled}
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
          onValueChange={(v) => v && onProject(v)}
          disabled={disabled}
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
  );
}

/** What a deletion would remove, counted as its options change. */
function useCount(options: CleanupOptions) {
  const [counts, setCounts] = useState<CleanupCounts | null | 'failed'>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(options);
  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    const timer = setTimeout(async () => {
      const result = await previewStorageCleanup(JSON.parse(key));
      if (!cancelled) setCounts(result.success ? result.data : 'failed');
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, attempt]);
  return { counts, retry: () => setAttempt((a) => a + 1) };
}

/** What a choice deletes: rows, unused source maps, as words and a size. */
function whatGoes(
  counts: CleanupCounts | null | 'failed',
  unused: SourceMapGcResult | null,
  projects: readonly ProjectStorage[],
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const known = counts === null || counts === 'failed' ? null : counts;
  const maps = unused?.files_removed ?? 0;
  const rows = known ? KINDS.reduce((sum, k) => sum + known[k], 0) : 0;
  const parts = known ? removedParts({ ...known, source_maps: maps }, t) : [];
  const bytes =
    (known ? estimateBytes(known, projects) : 0) + (unused?.bytes_freed ?? 0);
  return { maps, rows, parts, size: formatBytes(bytes) };
}

/** The source maps no upload uses: one count, with no age or project. */
function useUnused() {
  const [unused, setUnused] = useState<SourceMapGcResult | null | 'failed'>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setUnused(null);
    previewStorageSourceMapGc().then((result) => {
      if (!cancelled) setUnused(result.success ? result.data : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { unused, retryUnused: () => setAttempt((a) => a + 1) };
}

/** Two counts as one: failed if either failed, else counting if either is. */
function joined(
  ...states: ('counting' | 'failed' | 'ready')[]
): 'counting' | 'failed' | 'ready' {
  if (states.includes('failed')) return 'failed';
  return states.includes('counting') ? 'counting' : 'ready';
}

/**
 * Everything a deletion would remove, counted as its options change: the
 * rows of the chosen kinds and the unused source maps. Ready only once
 * every count asked for is in, since deleting on one still pending would
 * skip what it had not counted.
 */
function useDeletion(
  options: CleanupOptions,
  chosen: { rows: boolean; sourceMaps: boolean },
  projects: readonly ProjectStorage[],
) {
  const t = useTranslations('storage');
  const { counts, retry } = useCount(options);
  const { unused, retryUnused } = useUnused();
  const goes = whatGoes(
    counts,
    chosen.sourceMaps && unused !== 'failed' ? unused : null,
    projects,
    t,
  );
  const state = joined(
    chosen.rows ? impactState(counts) : 'ready',
    chosen.sourceMaps ? impactState(unused) : 'ready',
  );
  return {
    ...goes,
    state,
    retry: () => {
      retry();
      retryUnused();
    },
  };
}
