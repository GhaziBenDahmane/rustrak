import type {
  CreateMonitor,
  MonitorResponse,
  Result,
  RustrakError,
  UpdateMonitor,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function createMonitor(
  projectId: number,
  input: CreateMonitor,
): Promise<Result<MonitorResponse, RustrakError>> {
  const client = await createClient();
  return client.monitors.create({
    path: { project_id: projectId },
    body: input,
  });
}

export async function updateMonitor(
  projectId: number,
  slug: string,
  input: UpdateMonitor,
): Promise<Result<MonitorResponse, RustrakError>> {
  const client = await createClient();
  return client.monitors.update({
    path: { project_id: projectId, slug },
    body: input,
  });
}

export async function deleteMonitor(
  projectId: number,
  slug: string,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.monitors.delete({ path: { project_id: projectId, slug } });
}
