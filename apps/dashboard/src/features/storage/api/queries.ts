import type {
  Compaction,
  ProjectStorage,
  Result,
  RetentionResponse,
  RustrakError,
  StorageAge,
  StorageSummary,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/**
 * The two reads the storage page makes, and the only two callers are Server
 * Components.
 *
 * They used to sit in `storage.ts` under a single `'use server'` covering the
 * whole slice, which made both of them public POST endpoints. Nothing called
 * them from the browser, so that bought nothing and cost two endpoints.
 */

/** Instance-wide storage summary (counts + DB size + source-map weight). */
export async function getStorageSummary(): Promise<
  Result<StorageSummary, RustrakError>
> {
  const client = await createClient();
  return client.storage.getSummary();
}

/** Per-project storage breakdown (one row per project). */
export async function getStorageProjects(): Promise<
  Result<ProjectStorage[], RustrakError>
> {
  const client = await createClient();
  return client.storage.getProjects();
}

/** Retention: settings, next cleanup and last cleanup. */
export async function getRetention(): Promise<
  Result<RetentionResponse, RustrakError>
> {
  const client = await createClient();
  return client.storage.getRetention();
}

/** How long ago each project's data arrived, per kind. */
export async function getStorageAge(): Promise<
  Result<StorageAge, RustrakError>
> {
  const client = await createClient();
  return client.storage.getAge();
}

/** Whether the SQLite file gives freed space back, and what compacting takes. */
export async function getStorageCompaction(): Promise<
  Result<Compaction, RustrakError>
> {
  const client = await createClient();
  return client.storage.getCompaction();
}
