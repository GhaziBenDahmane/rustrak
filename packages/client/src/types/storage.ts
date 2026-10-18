import type { z } from 'zod';
import type {
  cleanupCountsSchema,
  cleanupOptionsSchema,
  cleanupStatusSchema,
  projectRetentionSchema,
  projectStorageSchema,
  retentionRunSchema,
  retentionSchema,
  retentionSettingsSchema,
  retentionWindowsSchema,
  sourceMapGcResultSchema,
  sourceMapStorageSchema,
  storageAgeSchema,
  storageSummarySchema,
} from '../schemas/storage.js';

/** Exact source-map storage weight. */
export type SourceMapStorage = z.infer<typeof sourceMapStorageSchema>;

/** Instance-wide storage summary (counts + DB size + source-map weight). */
export type StorageSummary = z.infer<typeof storageSummarySchema>;

/** Per-project storage breakdown row. */
export type ProjectStorage = z.infer<typeof projectStorageSchema>;

/** Rows affected by a cleanup preview or execution. */
export type CleanupCounts = z.infer<typeof cleanupCountsSchema>;

/** The background cleanup job: its state and the rows removed so far. */
export type CleanupStatus = z.infer<typeof cleanupStatusSchema>;

/** Outcome of a source-map garbage collection. */
export type SourceMapGcResult = z.infer<typeof sourceMapGcResultSchema>;

/** Request body for a cleanup: remove data older than `older_than_days`,
 * optionally scoped to one project (omit for all projects). */
export type CleanupOptions = z.infer<typeof cleanupOptionsSchema>;

/** How long each kind of data is kept; `null` keeps it forever. */
export type RetentionWindows = z.infer<typeof retentionWindowsSchema>;

/** A project kept for other windows than the defaults. */
export type ProjectRetention = z.infer<typeof projectRetentionSchema>;

/** Retention by default and per project, and when its cleanup runs. */
export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;

/** How the last retention cleanup went. */
export type RetentionRun = z.infer<typeof retentionRunSchema>;

/** How long ago each project's data arrived, per kind. */
export type StorageAge = z.infer<typeof storageAgeSchema>;

/** Retention: settings, next cleanup, last cleanup. */
export type Retention = z.infer<typeof retentionSchema>;
