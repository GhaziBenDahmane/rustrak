import type { CodeMapping } from '@rustrak/client';

/**
 * The rows the path-mappings form saves. An empty stack root matches every
 * path (the server strips it as a prefix), so only a row left entirely empty
 * is dropped.
 */
export function savableMappings(mappings: CodeMapping[]): CodeMapping[] {
  return mappings.filter((m) => m.stack_root || m.source_root);
}
