import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RustrakClient } from '@rustrak/client';
import { z } from 'zod';
import { mcpJson, mcpRefusal } from '../errors.js';

export function registerStorageTools(
  server: McpServer,
  client: RustrakClient,
): void {
  server.registerTool(
    'get_storage_summary',
    {
      description:
        'Get the instance-wide Rustrak storage summary (admin only): total database size, row counts for events, transactions, spans and logs, and the exact source-map weight. Use this to see what is consuming storage before cleaning up.',
      inputSchema: {},
    },
    async () => {
      const result = await client.storage.getSummary();
      return mcpJson(result);
    },
  );

  server.registerTool(
    'get_storage_by_project',
    {
      description:
        'Get the per-project Rustrak storage breakdown (admin only): event/transaction/span/source-map counts and estimated bytes for every project. Use this to find which project is accumulating the most data.',
      inputSchema: {},
    },
    async () => {
      const result = await client.storage.getProjects();
      return mcpJson(result);
    },
  );

  server.registerTool(
    'preview_storage_cleanup',
    {
      description:
        'Dry-run a Rustrak retention cleanup (admin only): report how many events, transactions, spans, logs and issues would be removed if data older than `older_than_days` were deleted, optionally scoped to one project and to specific data categories. Mutates nothing — always run this before execute_storage_cleanup.',
      inputSchema: {
        older_than_days: z
          .number()
          .int()
          .min(1)
          .describe('Delete data older than this many days'),
        project_id: z
          .number()
          .int()
          .optional()
          .describe('Scope to one project (omit for all projects)'),
        include_events: z
          .boolean()
          .optional()
          .describe(
            'Include error events (and the issues they empty). Defaults to true.',
          ),
        include_transactions: z
          .boolean()
          .optional()
          .describe(
            'Include transactions and their cascaded spans. Defaults to true.',
          ),
        include_logs: z
          .boolean()
          .optional()
          .describe('Include logs. Defaults to true.'),
      },
    },
    async ({
      older_than_days,
      project_id,
      include_events,
      include_transactions,
      include_logs,
    }) => {
      const result = await client.storage.previewCleanup({
        older_than_days,
        project_id,
        include_events,
        include_transactions,
        include_logs,
      });
      return mcpJson(result);
    },
  );

  server.registerTool(
    'execute_storage_cleanup',
    {
      description:
        'DESTRUCTIVE (admin only): permanently delete Rustrak data older than `older_than_days` (optionally scoped to one project and to specific data categories) and remove the issues it leaves with zero events. This cannot be undone. You MUST set confirm=true to proceed; without it the tool refuses and returns an error. Always run preview_storage_cleanup first and show the user the counts before confirming. The cleanup runs in the background: this returns the started job at once, and get_storage_cleanup_status reports its progress and final counts. Only one cleanup runs at a time; starting another while one runs is refused with a conflict.',
      inputSchema: {
        older_than_days: z
          .number()
          .int()
          .min(1)
          .describe('Delete data older than this many days'),
        project_id: z
          .number()
          .int()
          .optional()
          .describe('Scope to one project (omit for all projects)'),
        include_events: z
          .boolean()
          .optional()
          .describe(
            'Include error events (and the issues they empty). Defaults to true.',
          ),
        include_transactions: z
          .boolean()
          .optional()
          .describe(
            'Include transactions and their cascaded spans. Defaults to true.',
          ),
        include_logs: z
          .boolean()
          .optional()
          .describe('Include logs. Defaults to true.'),
        confirm: z
          .boolean()
          .optional()
          .describe('Must be true to run this destructive cleanup'),
      },
      annotations: { destructiveHint: true },
    },
    async ({
      older_than_days,
      project_id,
      include_events,
      include_transactions,
      include_logs,
      confirm,
    }) => {
      if (confirm !== true) {
        return mcpRefusal(
          'execute_storage_cleanup is destructive and was not confirmed. Run preview_storage_cleanup first, then call again with confirm=true to proceed.',
        );
      }
      const result = await client.storage.executeCleanup({
        older_than_days,
        project_id,
        include_events,
        include_transactions,
        include_logs,
      });
      return mcpJson(result);
    },
  );

  server.registerTool(
    'get_storage_cleanup_status',
    {
      description:
        'Get the progress of the running Rustrak storage cleanup, or the outcome of the last one (admin only): its state (idle, running, completed, failed), the rows removed so far, and when it started and finished. Use it after execute_storage_cleanup to tell the user when the deletion is done.',
      inputSchema: {},
    },
    async () => {
      const result = await client.storage.getCleanupStatus();
      return mcpJson(result);
    },
  );

  server.registerTool(
    'preview_storage_source_maps_gc',
    {
      description:
        'Dry-run a Rustrak source-map garbage collection (admin only): report how many orphaned source-map files would be removed and how many bytes reclaimed, without deleting anything. Mutates nothing — always run this before gc_storage_source_maps.',
      inputSchema: {},
    },
    async () => {
      const result = await client.storage.previewGcSourceMaps();
      return mcpJson(result);
    },
  );

  server.registerTool(
    'gc_storage_source_maps',
    {
      description:
        'DESTRUCTIVE (admin only): permanently remove orphaned Rustrak source-map files no longer referenced by any upload (e.g. left behind by deleted projects), from the database and disk. This cannot be undone. You MUST set confirm=true to proceed; without it the tool refuses and returns an error. Always run preview_storage_source_maps_gc first and show the user the counts before confirming.',
      inputSchema: {
        confirm: z
          .boolean()
          .optional()
          .describe('Must be true to run this destructive cleanup'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ confirm }) => {
      if (confirm !== true) {
        return mcpRefusal(
          'gc_storage_source_maps is destructive and was not confirmed. Run preview_storage_source_maps_gc first, then call again with confirm=true to proceed.',
        );
      }
      const result = await client.storage.gcSourceMaps();
      return mcpJson(result);
    },
  );

  // Days a kind of data is kept; null keeps it forever.
  const days = z.number().int().min(1).max(36_500).nullable();
  const retentionInput = {
    defaults: z
      .object({
        events_days: days.describe('Error events, and the issues they empty'),
        transactions_days: days.describe('Transactions with their spans'),
        logs_days: days.describe('Logs'),
      })
      .describe('How long every project keeps each kind; null is forever'),
    overrides: z
      .array(
        z.object({
          project_id: z.number().int(),
          events_days: days,
          transactions_days: days,
          logs_days: days,
        }),
      )
      .describe(
        'Projects kept for other windows; each replaces the defaults whole',
      ),
    frequency: z.enum(['daily', 'weekly']).describe('How often it runs'),
    hour: z.number().int().min(0).max(23).describe('Hour it runs, UTC'),
    weekday: z
      .number()
      .int()
      .min(0)
      .max(6)
      .describe('Day of a weekly run, 0 = Sunday'),
  };

  server.registerTool(
    'get_retention',
    {
      description:
        'Get the storage retention (admin only): how many days each kind of data (error events, transactions with their spans, logs) is kept by default and per project (null keeps it forever), ' +
        'when the cleanup that enforces it runs (daily or weekly at an hour, UTC), when it runs next and how its last run went.',
      inputSchema: {},
    },
    async () => mcpJson(await client.storage.getRetention()),
  );

  server.registerTool(
    'preview_retention',
    {
      description:
        'Dry-run retention settings (admin only): the rows enforcing them now would permanently delete, each project against its own windows. Saves and deletes nothing. ' +
        'Run it before update_retention and show the user the counts.',
      inputSchema: retentionInput,
    },
    async (settings) =>
      mcpJson(await client.storage.previewRetention(settings)),
  );

  server.registerTool(
    'run_retention',
    {
      description:
        'DESTRUCTIVE (admin only): enforce the saved retention now instead of waiting for the schedule. ' +
        "Permanently deletes every project's data older than its retention window, and the source maps no upload uses. " +
        'You MUST set confirm=true to proceed; without it the tool refuses. Run preview_retention with the saved settings first and show the user what goes. ' +
        'It runs in the background: this returns the started job, and get_storage_cleanup_status reports its progress.',
      inputSchema: {
        confirm: z
          .boolean()
          .optional()
          .describe('Must be true to run this destructive cleanup'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ confirm }) => {
      if (confirm !== true) {
        return mcpRefusal(
          'run_retention is destructive and was not confirmed. Run preview_retention, show the user what goes, then call again with confirm=true to proceed.',
        );
      }
      return mcpJson(await client.storage.runRetention());
    },
  );

  server.registerTool(
    'update_retention',
    {
      description:
        'Replace the storage retention settings (admin only). Every field is sent. ' +
        'DESTRUCTIVE whenever any window is set: the cleanup then permanently deletes data older than it on every run. You MUST set confirm=true to save such settings; without it the tool refuses. ' +
        'Keeping everything forever needs no confirmation. Run preview_retention first and show the user what goes.',
      inputSchema: {
        ...retentionInput,
        confirm: z
          .boolean()
          .optional()
          .describe('Must be true to save settings that delete anything'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ confirm, ...settings }) => {
      const deletes = [settings.defaults, ...settings.overrides].some(
        (w) =>
          w.events_days !== null ||
          w.transactions_days !== null ||
          w.logs_days !== null,
      );
      if (deletes && confirm !== true) {
        return mcpRefusal(
          'update_retention with a retention window schedules permanent deletion and was not confirmed. Run preview_retention, show the user what goes, then call again with confirm=true to proceed.',
        );
      }
      return mcpJson(await client.storage.updateRetention(settings));
    },
  );
}
