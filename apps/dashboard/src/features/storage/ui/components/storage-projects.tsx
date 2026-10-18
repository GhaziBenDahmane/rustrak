import type { RetentionSettings } from '@rustrak/client';
import { Pencil, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  KINDS,
  type ProjectShare,
  WINDOW_FIELD,
  windowsFor,
} from '@/features/storage/model/retention';
import { formatBytes } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/components/shadcn/badge';
import { Button } from '@/shared/ui/components/shadcn/button';
import { Input } from '@/shared/ui/components/shadcn/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/components/shadcn/table';

/** Past this many projects the table gets a search box. */
const SEARCH_FROM = 8;

/**
 * Which project holds what, largest first, and how long each keeps it.
 */
export function StorageProjects({
  projects,
  settings,
  onEditRetention,
}: {
  projects: readonly ProjectShare[];
  settings: RetentionSettings;
  onEditRetention: (project: { id: number; name: string }) => void;
}) {
  const t = useTranslations('storage');
  const [query, setQuery] = useState('');
  const shown = projects.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const keep = (days: number | null) =>
    days === null ? t('keep.forever') : t('keep.days', { count: days });

  return (
    <section aria-labelledby="storage-projects" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="storage-projects"
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          {t('projects.title')}
        </h2>
        {projects.length > SEARCH_FROM && (
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('projects.search')}
              aria-label={t('projects.search')}
              className="pl-8"
            />
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('projects.project')}</TableHead>
              <TableHead className="sm:w-[28%]">{t('projects.size')}</TableHead>
              {KINDS.map((k) => (
                <TableHead key={k} className="hidden text-right lg:table-cell">
                  {t(`kind.${k}`)}
                </TableHead>
              ))}
              <TableHead className="text-right">
                {t('projects.retention')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {projects.length === 0
                    ? t('projects.empty')
                    : t('projects.noMatch')}
                </TableCell>
              </TableRow>
            )}
            {shown.map((p) => {
              return (
                <TableRow key={p.id}>
                  <TableCell className="max-w-36 truncate font-medium sm:max-w-56">
                    {p.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${p.share * 100}%` }}
                        />
                      </div>
                      <span className="text-right font-medium tabular-nums sm:w-20">
                        {formatBytes(p.bytes)}
                      </span>
                    </div>
                  </TableCell>
                  {KINDS.map((k) => (
                    <TableCell
                      key={k}
                      className="hidden text-right tabular-nums text-muted-foreground lg:table-cell"
                    >
                      {formatBytes(p.byKind[k])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {/* The value is the action: one tap target, no extra
                        column to crowd a phone. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onEditRetention({ id: p.id, name: p.name })
                      }
                      aria-label={t('projects.change', { project: p.name })}
                      title={
                        p.custom
                          ? KINDS.map(
                              (k) =>
                                `${t(`kind.${k}`)} ${keep(windowsFor(settings, p.id)[WINDOW_FIELD[k]])}`,
                            ).join(' · ')
                          : undefined
                      }
                    >
                      {p.custom ? (
                        <Badge variant="secondary">{t('projects.own')}</Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('projects.general')}
                        </span>
                      )}
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
