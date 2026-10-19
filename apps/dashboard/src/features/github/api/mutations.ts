import type {
  GitHubLogin,
  IssueLink,
  ManifestResponse,
  ProjectRepository,
  Result,
  RustrakError,
  UpdateProjectRepository,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

export async function getManifest(
  organization?: string,
): Promise<Result<ManifestResponse, RustrakError>> {
  const client = await createClient();
  return client.github.manifest({ body: { organization } });
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
  return client.github.putProjectRepository({
    path: { project_id: projectId },
    body: input,
  });
}

export async function removeProjectRepository(
  projectId: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.github.deleteProjectRepository({
    path: { project_id: projectId },
  });
}

export async function syncCodeowners(
  projectId: number,
): Promise<Result<ProjectRepository, RustrakError>> {
  const client = await createClient();
  return client.github.syncCodeowners({ path: { project_id: projectId } });
}

export async function createGitHubIssue(
  projectId: number,
  issueId: string,
): Promise<Result<IssueLink, RustrakError>> {
  const client = await createClient();
  return client.github.createIssue({
    path: { project_id: projectId, issue_id: issueId },
    body: {},
  });
}

export async function linkGitHubIssue(
  projectId: number,
  issueId: string,
  reference: string,
): Promise<Result<IssueLink, RustrakError>> {
  const client = await createClient();
  return client.github.linkIssue({
    path: { project_id: projectId, issue_id: issueId },
    body: { reference },
  });
}

export async function unlinkGitHubIssue(
  projectId: number,
  issueId: string,
  linkId: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.github.unlinkIssue({
    path: { project_id: projectId, issue_id: issueId, link_id: linkId },
  });
}

export async function setMyGitHubLogin(
  login: string | null,
): Promise<Result<GitHubLogin, RustrakError>> {
  const client = await createClient();
  return client.github.putMyLogin({ body: { login } });
}
