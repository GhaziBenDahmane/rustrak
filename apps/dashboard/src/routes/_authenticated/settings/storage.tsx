import { createFileRoute } from '@tanstack/react-router';
import {
  Database,
  FileCode2,
  Layers,
  ListTree,
  ScrollText,
  ShieldX,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import { getProjects } from '@/features/project/api/queries';
import {
  getStorageProjects,
  getStorageSummary,
} from '@/features/storage/api/queries';
import { SourceMapGc } from '@/features/storage/ui/components/source-map-gc';
import { StorageCleanup } from '@/features/storage/ui/components/storage-cleanup';
import {
  CleanupSkeleton,
  ProjectsTableSkeleton,
  SummaryCardsSkeleton,
} from '@/features/storage/ui/components/storage-skeletons';
import { translator } from '@/shared/i18n/intl';
import { formatBytes } from '@/shared/lib/utils';
import { LoadFailure } from '@/shared/ui/components/load-failure';
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
import { useAsync } from '@/shared/ui/hooks/use-async';
import { useSessionUser } from '@/shared/ui/hooks/use-session-user';

export const Route = createFileRoute('/_authenticated/settings/storage')({
  head: () => {
    const t = translator('settings');
    return {
      meta: [
        { title: t('storage.meta.title') },
        { name: 'description', content: t('storage.meta.description') },
      ],
    };
  },
  component: StoragePage,
});

function PageHeader() {
  const t = useTranslations('settings');

  return (
    <div className="mb-6 md:mb-8">
      <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
        {t('storage.title')}
      </h1>
      <p className="text-muted-foreground mt-1">{t('storage.subtitle')}</p>
    </div>
  );
}

/**
 * Overview cards. Owns its own (heavy) summary query so it can stream in behind
 * a skeleton without blocking the rest of the page.
 */
function SummaryCards() {
  const format = useFormatter();
  const t = useTranslations('settings');
  const read = useAsync(() => getStorageSummary(), []);

  if (read.state === 'pending') return <SummaryCardsSkeleton />;
  const result = read.data;

  if (!result.success) {
    return (
      <LoadFailure
        error={result.error}
        title={t('storage.loadSummaryFailed')}
        notFoundOnMissing={false}
      />
    );
  }

  const summary = result.data;

  const cards = [
    {
      id: 'dbSize',
      label: t('storage.dbSize'),
      value: formatBytes(summary.total_db_size_bytes),
      sub: t('storage.eventsCount', {
        count: format.number(summary.events_count),
      }),
      icon: Database,
    },
    {
      id: 'transactions',
      label: t('storage.transactions'),
      value: format.number(summary.transactions_count),
      sub: t('storage.spansCount', {
        count: format.number(summary.spans_count),
      }),
      icon: ListTree,
    },
    {
      id: 'spans',
      label: t('storage.spans'),
      value: format.number(summary.spans_count),
      sub: t('storage.spansSub'),
      icon: Layers,
    },
    {
      id: 'logs',
      label: t('storage.logs'),
      value: format.number(summary.logs_count),
      sub: t('storage.logsSub'),
      icon: ScrollText,
    },
    {
      id: 'sourceMaps',
      label: t('storage.sourceMaps'),
      value: formatBytes(summary.source_maps.total_bytes),
      sub: t('storage.sourceMapsFiles', {
        count: format.number(summary.source_maps.file_count),
      }),
      icon: FileCode2,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.id} size="sm">
            <CardContent>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Icon className="size-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {card.label}
                </span>
              </div>
              <p className="text-xl font-extrabold tracking-tight leading-tight">
                {card.value}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{card.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Per-project breakdown table. Owns the heavy per-project aggregation query and
 * streams in independently of the cards above.
 */
function ProjectsTable() {
  const format = useFormatter();
  const t = useTranslations('settings');
  const read = useAsync(() => getStorageProjects(), []);

  if (read.state === 'pending') return <ProjectsTableSkeleton />;
  const result = read.data;

  if (!result.success) {
    return (
      <LoadFailure
        error={result.error}
        title={t('storage.loadBreakdownFailed')}
        notFoundOnMissing={false}
      />
    );
  }

  const projects = result.data;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t('storage.byProject')}</CardTitle>
        <CardDescription>{t('storage.byProjectDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mobile: card list */}
        <div className="md:hidden space-y-3">
          {projects.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {t('storage.noProjects')}
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.project_id}
                className="rounded-lg border p-3 space-y-2"
              >
                <p className="text-sm font-medium">{p.project_name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">
                    {t('storage.events')}
                  </span>
                  <span className="tabular-nums text-right">
                    {format.number(p.events_count)}
                  </span>
                  <span className="text-muted-foreground">
                    {t('storage.transactions')}
                  </span>
                  <span className="tabular-nums text-right">
                    {format.number(p.transactions_count)}
                  </span>
                  <span className="text-muted-foreground">
                    {t('storage.spans')}
                  </span>
                  <span className="tabular-nums text-right">
                    {format.number(p.spans_count)}
                  </span>
                  <span className="text-muted-foreground">
                    {t('storage.logs')}
                  </span>
                  <span className="tabular-nums text-right">
                    {format.number(p.logs_count)}
                  </span>
                  <span className="text-muted-foreground">
                    {t('storage.sourceMaps')}
                  </span>
                  <span className="tabular-nums text-right">
                    {format.number(p.source_maps_count)}
                  </span>
                  <span className="text-muted-foreground">
                    {t('storage.estSize')}
                  </span>
                  <span className="tabular-nums text-right">
                    {formatBytes(p.estimated_bytes)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop: table */}
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('storage.project')}</TableHead>
              <TableHead className="text-right">
                {t('storage.events')}
              </TableHead>
              <TableHead className="text-right">
                {t('storage.transactions')}
              </TableHead>
              <TableHead className="text-right">{t('storage.spans')}</TableHead>
              <TableHead className="text-right">{t('storage.logs')}</TableHead>
              <TableHead className="text-right">
                {t('storage.sourceMaps')}
              </TableHead>
              <TableHead className="text-right">
                {t('storage.estSize')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {t('storage.noProjects')}
                </TableCell>
              </TableRow>
            ) : (
              projects.map((p) => (
                <TableRow key={p.project_id}>
                  <TableCell className="font-medium">
                    {p.project_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(p.events_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(p.transactions_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(p.spans_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(p.logs_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(p.source_maps_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(p.estimated_bytes)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Cleanup panel. Uses the lightweight projects list (id + name) for its scope
 * selector instead of waiting on the heavy per-project storage aggregation, so
 * it can stream in early.
 */
function CleanupPanel() {
  const t = useTranslations('settings');
  // Fetch every project in one shot (the API applies no hard page-size cap) so
  // the scope selector never silently drops projects.
  const read = useAsync(() => getProjects({ per_page: 10000 }), []);

  if (read.state === 'pending') return <CleanupSkeleton />;
  const result = read.data;

  if (!result.success) {
    return (
      <LoadFailure
        error={result.error}
        title={t('loadProjectsFailed')}
        notFoundOnMissing={false}
      />
    );
  }

  return (
    <StorageCleanup
      projects={result.data.items.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}

function StoragePage() {
  const t = useTranslations('settings');
  // Resolved by the gate above. The "we could not ask" branch that used to sit
  // between these two is `_authenticated`'s now: telling a visitor "Not
  // authorized" when the truth is "we could not reach the API to find out" is
  // a lie about their permissions, and it is told in one place or none.
  const user = useSessionUser();

  // Guard: storage usage and cleanup are instance-admin only.
  if (user.role !== 'admin') {
    return (
      <>
        <PageHeader />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldX className="size-12 text-muted-foreground/50 mb-4" />
            <p className="font-semibold">{t('notAuthorized')}</p>
            <p className="text-muted-foreground mt-1 text-sm max-w-sm">
              {t('storage.notAuthorizedDescription')}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  // The page shell + header render immediately. Each data-heavy section owns
  // its own query and its own skeleton, so they fill in independently instead
  // of the whole page blocking on the slowest one.
  return (
    <>
      <PageHeader />
      <SummaryCards />
      <ProjectsTable />
      <div className="space-y-6">
        <CleanupPanel />
        <SourceMapGc />
      </div>
    </>
  );
}
