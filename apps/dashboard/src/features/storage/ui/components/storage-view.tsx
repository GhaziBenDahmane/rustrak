import type {
  CleanupStatus,
  ProjectStorage,
  Retention,
  StorageAge,
  StorageSummary,
} from '@rustrak/client';
import { Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { getRetention } from '@/features/storage/api/queries';
import {
  KINDS,
  nextReadIn,
  summarize,
} from '@/features/storage/model/retention';
import { Button } from '@/shared/ui/components/shadcn/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/components/shadcn/card';
import { useCleanupJob } from '../hooks/use-cleanup-job';
import { AgeChart } from './age-chart';
import { DeleteDialog } from './delete-dialog';
import { ProjectRetentionDialog } from './project-retention-dialog';
import { RetentionDialog } from './retention-dialog';
import { StorageOverview } from './storage-overview';
import { StorageProjects } from './storage-projects';

export interface StorageViewData {
  summary: StorageSummary;
  projects: readonly ProjectStorage[];
  age: StorageAge;
  retention: Retention;
}

/**
 * The storage page: what is held, how old it is, and which project holds
 * it. The header's two actions change retention and delete data now; a
 * project's own retention is changed from its row.
 */
export function StorageView({
  data,
  title,
  subtitle,
  onChanged,
}: {
  data: StorageViewData;
  title: string;
  subtitle: string;
  /** Reads the page's data again, after a cleanup. */
  onChanged: () => void;
}) {
  const t = useTranslations('storage');
  const [retention, setRetention] = useState(data.retention);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [project, setProject] = useState<{ id: number; name: string } | null>(
    null,
  );
  const cleanup = useCleanupJob(onChanged);

  // One read of the saved status per status: a save leaves the next run for
  // the scheduler's next tick, and a scheduled cleanup runs at its time.
  useEffect(() => {
    const delay = nextReadIn(retention, Date.now());
    if (delay === null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await getRetention();
      if (cancelled) return;
      setRetention((prev) => (result.success ? result.data : { ...prev }));
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [retention]);

  const summary = useMemo(
    () =>
      summarize({
        projects: data.projects,
        age: data.age,
        sourceMaps: {
          files: data.summary.source_maps.file_count,
          bytes: data.summary.source_maps.total_bytes,
        },
        settings: retention.settings,
      }),
    [data, retention.settings],
  );
  const saved = (next: Retention, job: CleanupStatus | null) => {
    setRetention(next);
    if (job) cleanup.follow(job);
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
            {title}
          </h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setDeleting(true)}
            disabled={cleanup.running}
          >
            <Trash2 />
            {t('deleteAction')}
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Settings2 />
            {t('action')}
          </Button>
        </div>
      </div>

      <StorageOverview
        summary={summary}
        retention={retention}
        job={cleanup.job}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t('age.title')}
          </CardTitle>
          <CardDescription>{t('age.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AgeChart buckets={summary.buckets} kinds={KINDS} />
        </CardContent>
      </Card>

      <StorageProjects
        projects={summary.projects}
        settings={retention.settings}
        onEditRetention={setProject}
      />

      <RetentionDialog
        open={editing}
        onOpenChange={setEditing}
        retention={retention}
        projects={data.projects}
        onDone={saved}
      />
      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        projects={data.projects}
        onStarted={cleanup.follow}
      />
      <ProjectRetentionDialog
        project={project}
        onClose={() => setProject(null)}
        retention={retention}
        projects={data.projects}
        onDone={saved}
      />
    </div>
  );
}
