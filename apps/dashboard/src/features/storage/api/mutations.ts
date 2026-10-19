import type {
  CleanupCounts,
  CleanupRequest,
  CleanupStatus,
  Result,
  RetentionResponse,
  RetentionSettings,
  RustrakError,
  SourceMapGcResult,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/**
 * Everything the storage page's client components call.
 *
 * The two `preview*` functions mutate nothing, so they read oddly in a file
 * named `mutations.ts`. They belong here all the same: the split is by **who
 * calls it**, not by what it does to the database: the storage page calls
 * them from event handlers, as the user edits.
 *
 * Both are POST on the server too, because a preview takes a `CleanupRequest`
 * body it has to compute against.
 */

/** Dry-run: count what a cleanup would remove. Mutates nothing. */
export async function previewStorageCleanup(
  options: CleanupRequest,
): Promise<Result<CleanupCounts, RustrakError>> {
  const client = await createClient();
  return client.storage.previewCleanup({ body: options });
}

/**
 * Start a cleanup: permanently delete old data and emptied issues. Returns once
 * the server has started it; follow it with {@link getStorageCleanupStatus}.
 */
export async function executeStorageCleanup(
  options: CleanupRequest,
): Promise<Result<CleanupStatus, RustrakError>> {
  const client = await createClient();
  return client.storage.executeCleanup({ body: options });
}

/** The running cleanup's progress, or the outcome of the last one. */
export async function getStorageCleanupStatus(): Promise<
  Result<CleanupStatus, RustrakError>
> {
  const client = await createClient();
  return client.storage.getCleanupStatus();
}

/** Dry-run: count orphaned source maps a GC would remove. Mutates nothing. */
export async function previewStorageSourceMapGc(): Promise<
  Result<SourceMapGcResult, RustrakError>
> {
  const client = await createClient();
  return client.storage.previewSourceMapGc();
}

/** Garbage-collect orphaned source maps (DB rows + disk files). */
export async function gcStorageSourceMaps(): Promise<
  Result<SourceMapGcResult, RustrakError>
> {
  const client = await createClient();
  return client.storage.gcSourceMaps();
}

/** Saves the retention settings. */
export async function updateRetention(
  settings: RetentionSettings,
): Promise<Result<RetentionResponse, RustrakError>> {
  const client = await createClient();
  return client.storage.updateRetention({ body: settings });
}

/** Dry-run: what enforcing these settings now would delete. */
export async function previewRetention(
  settings: RetentionSettings,
): Promise<Result<CleanupCounts, RustrakError>> {
  const client = await createClient();
  return client.storage.previewRetention({ body: settings });
}

/** Enforces the saved retention now; follow it with the cleanup status. */
export async function runRetention(): Promise<
  Result<CleanupStatus, RustrakError>
> {
  const client = await createClient();
  return client.storage.runRetention();
}
