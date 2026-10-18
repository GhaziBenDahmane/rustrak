/**
 * A monitor's page. Under `m/` because a slug is any `[a-z0-9_-]` word, so a
 * static sibling such as `crons/new` would otherwise shadow the monitor of
 * that slug.
 */
export function monitorHref(projectId: number, slug: string): string {
  return `/projects/${projectId}/crons/m/${encodeURIComponent(slug)}`;
}
