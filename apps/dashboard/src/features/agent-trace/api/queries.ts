/**
 * Reads for the agent-monitoring pages.
 *
 * No `mutations.ts` beside this: nothing in the product writes an agent trace,
 * they arrive through ingestion. A slice with only one half of its `api`
 * segment is the expected shape, not an omission.
 *
 * `import 'server-only'` is a build-time poison pill rather than a directive:
 * if this module reaches the client bundle the build fails, instead of shipping
 * a browser bundle that holds the session cookie.
 */
import type {
  AgentDurationPoint,
  AgentModelRow,
  AgentSummary,
  AgentsRunsData,
  AgentsSummaryData,
  AgentsTracesData,
  AgentsTracesResponse,
  AgentTimeseriesPoint,
  AgentToolRow,
  GenAiBreakdownRow,
  Result,
  RustrakError,
  SpanDetailResponse,
  SpansListData,
  SpansListResponse,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

type AgentBreakdownQuery = NonNullable<AgentsSummaryData['query']>;
type AgentTimeseriesQuery = NonNullable<AgentsRunsData['query']>;

export async function listSpans(
  projectId: number,
  options?: NonNullable<SpansListData['query']>,
): Promise<Result<SpansListResponse, RustrakError>> {
  const client = await createClient();
  return client.spans.list({ path: { project_id: projectId }, query: options });
}

/**
 * One span with its raw `gen_ai.*` attribute bag — the prompts, responses and
 * tool arguments the list deliberately leaves out.
 *
 * Fetched per selected span rather than for the whole trace: the server never
 * trims `spans.data`, so a trace's worth of prompts would dwarf the waterfall
 * they are drawn from.
 */
export async function getSpan(
  projectId: number,
  spanId: string,
): Promise<Result<SpanDetailResponse, RustrakError>> {
  const client = await createClient();
  return client.spans.get({ path: { project_id: projectId, span_id: spanId } });
}

export async function getAgentRuns(
  projectId: number,
  options?: AgentTimeseriesQuery,
): Promise<Result<AgentTimeseriesPoint[], RustrakError>> {
  const client = await createClient();
  return client.agents.runs({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentDuration(
  projectId: number,
  options?: AgentTimeseriesQuery,
): Promise<Result<AgentDurationPoint[], RustrakError>> {
  const client = await createClient();
  return client.agents.duration({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentModelsByCalls(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<GenAiBreakdownRow[], RustrakError>> {
  const client = await createClient();
  return client.agents.modelsCalls({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentModelsByTokens(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<GenAiBreakdownRow[], RustrakError>> {
  const client = await createClient();
  return client.agents.modelsTokens({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentTools(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<GenAiBreakdownRow[], RustrakError>> {
  const client = await createClient();
  return client.agents.tools({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentTraces(
  projectId: number,
  options?: NonNullable<AgentsTracesData['query']>,
): Promise<Result<AgentsTracesResponse, RustrakError>> {
  const client = await createClient();
  return client.agents.traces({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentSummary(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<AgentSummary, RustrakError>> {
  const client = await createClient();
  return client.agents.summary({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentModelsTable(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<AgentModelRow[], RustrakError>> {
  const client = await createClient();
  return client.agents.modelsTable({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentToolsTable(
  projectId: number,
  options?: AgentBreakdownQuery,
): Promise<Result<AgentToolRow[], RustrakError>> {
  const client = await createClient();
  return client.agents.toolsTable({
    path: { project_id: projectId },
    query: options,
  });
}

export async function getAgentEnvironments(
  projectId: number,
): Promise<Result<string[], RustrakError>> {
  const client = await createClient();
  return client.agents.environments({ path: { project_id: projectId } });
}
