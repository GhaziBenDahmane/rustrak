import type {
  GitHubManifest,
  IssueLink,
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

export async function syncCodeowners(
  projectId: number,
): Promise<Result<ProjectRepository, RustrakError>> {
  const client = await createClient();
  return client.github.syncCodeowners(projectId);
}

export async function createGitHubIssue(
  projectId: number,
  issueId: string,
): Promise<Result<IssueLink, RustrakError>> {
  const client = await createClient();
  return client.github.createIssue(projectId, issueId);
}

export async function linkGitHubIssue(
  projectId: number,
  issueId: string,
  reference: string,
): Promise<Result<IssueLink, RustrakError>> {
  const client = await createClient();
  return client.github.linkIssue(projectId, issueId, reference);
}

export async function unlinkGitHubIssue(
  projectId: number,
  issueId: string,
  linkId: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.github.unlinkIssue(projectId, issueId, linkId);
}

export async function setMyGitHubLogin(
  login: string | null,
): Promise<Result<{ login: string | null }, RustrakError>> {
  const client = await createClient();
  return client.github.setMyLogin(login);
}
