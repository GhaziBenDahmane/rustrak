import { getProjects } from '@/features/project/api/queries';
import { toCommandProjects } from '@/features/project/lib/command-items';
import { COMMAND_BAR_PROJECT_LIMIT } from '@/shared/config/commands';
import { CommandBar } from '@/shared/ui/components/command-bar/command-bar';
import { useAsync } from '@/shared/ui/hooks/use-async';

/**
 * Composition seam for the command bar: it spans the `project` slice and the
 * static settings routes, so neither feature can own it and it is assembled
 * here instead.
 *
 * The projects read is its own, not the layout's, which is what `<Suspense>`
 * bought around it under Next: the header must paint before this lands. A
 * failed or pending read still renders the bar — the static commands are the
 * bulk of it, and a search box that silently disappears is worse than one
 * missing project entries.
 *
 * One page, on purpose: see `COMMAND_BAR_PROJECT_LIMIT` for why the bar has a
 * stated ceiling instead of paging until the instance runs out.
 */
export function CommandBarSlot() {
  const read = useAsync(
    () => getProjects({ per_page: COMMAND_BAR_PROJECT_LIMIT }),
    [],
  );

  const projects =
    read.state === 'ready' && read.data.success ? read.data.data.items : [];

  return <CommandBar projects={toCommandProjects(projects)} />;
}
