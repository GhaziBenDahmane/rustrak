/**
 * Reads for the log feature, called straight from Server Components.
 *
 * `import 'server-only'` is a build-time poison pill rather than a directive:
 * if this module reaches the client bundle the build fails, instead of shipping
 * a browser bundle that holds the session cookie.
 */
import type {
  LogsListData,
  LogsListResponse,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function listLogs(
  projectId: number,
  options?: NonNullable<LogsListData['query']>,
): Promise<Result<LogsListResponse, RustrakError>> {
  const client = await createClient();
  return client.logs.list({ path: { project_id: projectId }, query: options });
}
