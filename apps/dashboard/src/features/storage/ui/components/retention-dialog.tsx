import type {
  CleanupStatus,
  ProjectStorage,
  RetentionResponse,
  RetentionSettings,
} from '@rustrak/client';
import { useFormatter, useTranslations } from 'use-intl';
import { KINDS, WINDOW_FIELD } from '@/features/storage/model/retention';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/shadcn/select';
import { useRetentionDraft } from '../hooks/use-retention-draft';
import { KeepForSelect } from './keep-for-select';
import { RetentionFooter } from './retention-footer';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = Array.from({ length: 7 }, (_, d) => d);

/**
 * Retention for every project: how long each kind is kept, and when the
 * cleanup runs. A project's own retention is changed from its row.
 */
export function RetentionDialog({
  open,
  onOpenChange,
  retention,
  projects,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retention: RetentionResponse;
  projects: readonly ProjectStorage[];
  onDone: (saved: RetentionResponse, job: CleanupStatus | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <Editor
            retention={retention}
            projects={projects}
            onDone={(saved, job) => {
              onDone(saved, job);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  retention,
  projects,
  onDone,
  onCancel,
}: {
  retention: RetentionResponse;
  projects: readonly ProjectStorage[];
  onDone: (saved: RetentionResponse, job: CleanupStatus | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('storage');
  const { draft, setDraft, impact, retry, isPending, save } = useRetentionDraft(
    retention.settings,
    onDone,
  );
  const custom = draft.overrides.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('dialog.title')}</DialogTitle>
        <DialogDescription>{t('dialog.description')}</DialogDescription>
      </DialogHeader>

      <div className="divide-y rounded-md border">
        <div className="flex items-center justify-between gap-4 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{t('dialog.kindColumn')}</span>
          <span className="w-44">{t('dialog.keepColumn')}</span>
        </div>
        {KINDS.map((kind) => (
          <div
            key={kind}
            className="flex items-center justify-between gap-4 px-3 py-2.5"
          >
            <label htmlFor={`keep-${kind}`} className="min-w-0">
              <span className="block text-sm font-medium">
                {t(`kind.${kind}`)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`kindHint.${kind}`)}
              </span>
            </label>
            <div className="w-44 shrink-0">
              <KeepForSelect
                id={`keep-${kind}`}
                value={draft.defaults[WINDOW_FIELD[kind]]}
                onChange={(days) =>
                  setDraft((d) => ({
                    ...d,
                    defaults: { ...d.defaults, [WINDOW_FIELD[kind]]: days },
                  }))
                }
                disabled={isPending}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        {t('dialog.foreverHint')}
      </p>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t('dialog.runs')}</p>
        <Schedule
          settings={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          disabled={isPending}
        />
        {custom > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('dialog.customProjects', { count: custom })}
          </p>
        )}
      </div>

      <RetentionFooter
        impact={impact}
        onRetry={retry}
        projects={projects}
        isPending={isPending}
        onCancel={onCancel}
        onSave={save}
      />
    </>
  );
}

/** "Every day / Every week on …, at hh:00 UTC" as one row of selects. */
function Schedule({
  settings,
  onChange,
  disabled,
}: {
  settings: RetentionSettings;
  onChange: (patch: Partial<RetentionSettings>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('storage');
  const format = useFormatter();
  // 1 January 2023 was a Sunday: day `d` of that week names weekday `d`.
  const weekday = (d: number) =>
    format.dateTime(new Date(Date.UTC(2023, 0, 1 + d)), {
      weekday: 'long',
      timeZone: 'UTC',
    });
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00 UTC`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Select
        value={settings.frequency}
        onValueChange={(v) =>
          v && onChange({ frequency: v as RetentionSettings['frequency'] })
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-36" aria-label={t('dialog.frequency')}>
          <SelectValue>{(v: string) => t(`schedule.${v}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">{t('schedule.daily')}</SelectItem>
          <SelectItem value="weekly">{t('schedule.weekly')}</SelectItem>
        </SelectContent>
      </Select>
      {settings.frequency === 'weekly' && (
        <Select
          value={String(settings.weekday)}
          onValueChange={(v) => v && onChange({ weekday: Number(v) })}
          disabled={disabled}
        >
          <SelectTrigger className="w-36" aria-label={t('dialog.weekday')}>
            <SelectValue>{(v: string) => weekday(Number(v))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {WEEKDAYS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {weekday(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span className="text-muted-foreground">{t('dialog.at')}</span>
      <Select
        value={String(settings.hour)}
        onValueChange={(v) => v && onChange({ hour: Number(v) })}
        disabled={disabled}
      >
        <SelectTrigger
          className="w-32 tabular-nums"
          aria-label={t('dialog.hour')}
        >
          <SelectValue>{(v: string) => hour(Number(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {hour(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
