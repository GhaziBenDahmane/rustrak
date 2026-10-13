import type {
  GitHubManifest,
  ProjectRepository,
  Result,
  RustrakError,
  UpdateProjectRepository,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function getManifest(
  organization?: string,
): Promise<Result<GitHubManifest, RustrakError>> {
  const client = await createClient();
  return client.github.manifest(organization);
}

export async function disconnectGitHub(): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.github.disconnect();
}

export async function setProjectRepository(
  projectId: number,
  input: UpdateProjectRepository,
): Promise<Result<ProjectRepository, RustrakError>> {
  const client = await createClient();
  return client.github.setProjectRepository(projectId, input);
}

export async function removeProjectRepository(
  projectId: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.github.removeProjectRepository(projectId);
}
