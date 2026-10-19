import type {
  MonitorResponse,
  MonitorsListCheckinsData,
  MonitorsListCheckinsResponse,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function listMonitors(
  projectId: number,
): Promise<Result<MonitorResponse[], RustrakError>> {
  const client = await createClient();
  return client.monitors.list({ path: { project_id: projectId } });
}

export async function getMonitor(
  projectId: number,
  slug: string,
): Promise<Result<MonitorResponse, RustrakError>> {
  const client = await createClient();
  return client.monitors.get({ path: { project_id: projectId, slug } });
}

export async function listCheckIns(
  projectId: number,
  slug: string,
  options?: MonitorsListCheckinsData['query'],
): Promise<Result<MonitorsListCheckinsResponse, RustrakError>> {
  const client = await createClient();
  return client.monitors.listCheckins({
    path: { project_id: projectId, slug },
    query: options,
  });
}
