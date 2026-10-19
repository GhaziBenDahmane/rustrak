/**
 * Reads for the GitHub integration: the instance's connection, a project's
 * repository, and what an issue knows from GitHub.
 */
import type {
  GitHubLogin,
  GitHubRepository,
  GitHubStatus,
  IssueGitHub,
  ProjectRepository,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function getGitHubStatus(): Promise<
  Result<GitHubStatus, RustrakError>
> {
  const client = await createClient();
  return client.github.status();
}

export async function listRepositories(
  projectId: number,
): Promise<Result<GitHubRepository[], RustrakError>> {
  const client = await createClient();
  return client.github.repositories({ query: { project_id: projectId } });
}

export async function getProjectRepository(
  projectId: number,
): Promise<Result<ProjectRepository | null, RustrakError>> {
  const client = await createClient();
  return client.github.getProjectRepository({
    path: { project_id: projectId },
  });
}

export async function getIssueGitHub(
  projectId: number,
  issueId: string,
): Promise<Result<IssueGitHub, RustrakError>> {
  const client = await createClient();
  return client.github.issue({
    path: { project_id: projectId, issue_id: issueId },
  });
}

export async function getMyGitHubLogin(): Promise<
  Result<GitHubLogin, RustrakError>
> {
  const client = await createClient();
  return client.github.getMyLogin();
}
