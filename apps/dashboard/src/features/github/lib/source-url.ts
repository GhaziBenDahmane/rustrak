import type { CodeMapping, ProjectRepository } from '@rustrak/client';

/**
 * The repository path of a stack frame's file. Mirrors `repo_path` in
 * `apps/server/src/services/github/mod.rs`, which picks suspect commits and
 * owners with the same rule: the first code mapping whose stack root prefixes
 * the path wins; without one, bundler schemes and a leading `./` or `/` go.
 */
export function repoPath(
  framePath: string,
  mappings: readonly CodeMapping[],
): string | null {
  if (!framePath) return null;
  for (const mapping of mappings) {
    if (framePath.startsWith(mapping.stack_root)) {
      const root = mapping.source_root.replace(/^\/+|\/+$/g, '');
      const rest = framePath
        .slice(mapping.stack_root.length)
        .replace(/^\/+/, '');
      return root ? `${root}/${rest}` : rest;
    }
  }
  let path = framePath;
  const triple = path.indexOf(':///');
  const double = path.indexOf('://');
  if (triple >= 0) {
    path = path.slice(triple + 4);
  } else if (double >= 0) {
    // `app://host/path`: the scheme and the host go.
    const rest = path.slice(double + 3);
    const slash = rest.indexOf('/');
    path = slash >= 0 ? rest.slice(slash + 1) : '';
  }
  path = path.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  return path || null;
}

/** Where a frame's line lives on GitHub, on the default branch. */
export function frameSourceUrl(
  repo: Pick<
    ProjectRepository,
    'html_url' | 'default_branch' | 'code_mappings'
  >,
  filename: string | undefined,
  lineno?: number | null,
): string | null {
  const path = repoPath(filename ?? '', repo.code_mappings);
  if (!path) return null;
  const line = lineno != null ? `#L${lineno}` : '';
  return `${repo.html_url}/blob/${repo.default_branch}/${path}${line}`;
}
