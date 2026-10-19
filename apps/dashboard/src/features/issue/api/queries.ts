/**
 * Reads for the issues feature, called straight from Server Components.
 *
 * `import 'server-only'` is a build-time poison pill rather than a directive:
 * if this module ever reaches the client bundle the build fails, instead of
 * shipping a browser bundle that holds the session cookie.
 */
import type {
  ActivityEntry,
  IssueAggregates,
  IssueResponse,
  IssueStatsResponse,
  IssuesGetStatsData,
  IssuesListData,
  IssuesListResponse,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/**
 * List issues for a project with offset-based pagination.
 *
 * @param projectId - The project ID
 * @param options - Optional filtering and pagination options
 * @returns Paginated list of issues with total count
 */

/**
 * List issues for a project with offset-based pagination.
 *
 * @param projectId - The project ID
 * @param options - Optional filtering and pagination options
 * @returns Paginated list of issues with total count
 */
export async function listIssues(
  projectId: number,
  options?: IssuesListData['query'],
): Promise<Result<IssuesListResponse, RustrakError>> {
  const client = await createClient();
  return client.issues.list({
    path: { project_id: projectId },
    query: options,
  });
}

/**
 * Get a single issue by ID.
 *
 * @param projectId - The project ID
 * @param issueId - The issue UUID
 * @returns The issue
 */
export async function getIssue(
  projectId: number,
  issueId: string,
): Promise<Result<IssueResponse, RustrakError>> {
  const client = await createClient();
  return client.issues.get({
    path: { project_id: projectId, issue_id: issueId },
  });
}

/**
 * Get per-issue aggregates (unique user count + top tags).
 *
 * @param projectId - The project ID
 * @param issueId - The issue UUID
 */
export async function getIssueAggregates(
  projectId: number,
  issueId: string,
): Promise<Result<IssueAggregates, RustrakError>> {
  const client = await createClient();
  return client.issues.getAggregates({
    path: { project_id: projectId, issue_id: issueId },
  });
}

/**
 * Get a zero-filled event-count timeseries for an issue (24h or 30d).
 *
 * @param projectId - The project ID
 * @param issueId - The issue UUID
 * @param window - The time window (`24h` or `30d`)
 */
export async function getIssueStats(
  projectId: number,
  issueId: string,
  window: NonNullable<IssuesGetStatsData['query']>['window'] = '24h',
): Promise<Result<IssueStatsResponse, RustrakError>> {
  const client = await createClient();
  return client.issues.getStats({
    path: { project_id: projectId, issue_id: issueId },
    query: { window },
  });
}

/**
 * Get an issue's activity log (status changes, comments/notes, etc.).
 *
 * @param projectId - The project ID
 * @param issueId - The issue UUID
 */
export async function getIssueActivity(
  projectId: number,
  issueId: string,
): Promise<Result<ActivityEntry[], RustrakError>> {
  const client = await createClient();
  return client.issues.getActivity({
    path: { project_id: projectId, issue_id: issueId },
  });
}
