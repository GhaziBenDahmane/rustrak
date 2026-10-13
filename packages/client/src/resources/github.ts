import type { RustrakError } from '../errors.js';
import type { Result } from '../result.js';
import {
  gitHubManifestSchema,
  gitHubRepositorySchema,
  gitHubStatusSchema,
  projectRepositorySchema,
  updateProjectRepositorySchema,
} from '../schemas/index.js';
import type {
  GitHubManifest,
  GitHubRepository,
  GitHubStatus,
  ProjectRepository,
  UpdateProjectRepository,
} from '../types/index.js';
import { BaseResource } from './base.js';

/**
 * GitHub integration: the instance's GitHub App, a project's repository, and
 * the GitHub issues linked to an issue.
 */
export class GitHubResource extends BaseResource {
  /** The app, its installations and the webhook address (admin only). */
  async status(): Promise<Result<GitHubStatus, RustrakError>> {
    return this.request(() => this.http.get('api/github'), gitHubStatusSchema);
  }

  /** The form to post to GitHub to create the app, under an org if given. */
  async manifest(
    organization?: string,
  ): Promise<Result<GitHubManifest, RustrakError>> {
    return this.request(
      () => this.http.post('api/github/manifest', { json: { organization } }),
      gitHubManifestSchema,
    );
  }

  async disconnect(): Promise<Result<void, RustrakError>> {
    return this.requestVoid(() => this.http.delete('api/github'));
  }

  /** Repositories the installations reach, for a project's settings. */
  async repositories(
    projectId: number,
  ): Promise<Result<GitHubRepository[], RustrakError>> {
    return this.request(
      () =>
        this.http.get('api/github/repositories', {
          searchParams: { project_id: projectId },
        }),
      gitHubRepositorySchema.array(),
    );
  }

  async projectRepository(
    projectId: number,
  ): Promise<Result<ProjectRepository | null, RustrakError>> {
    return this.request(
      () => this.http.get(`api/projects/${projectId}/github`),
      projectRepositorySchema.nullable(),
    );
  }

  async setProjectRepository(
    projectId: number,
    input: UpdateProjectRepository,
  ): Promise<Result<ProjectRepository, RustrakError>> {
    const validated = this.validateInput(input, updateProjectRepositorySchema);
    if (!validated.success) {
      return validated;
    }
    return this.request(
      () =>
        this.http.put(`api/projects/${projectId}/github`, {
          json: validated.data,
        }),
      projectRepositorySchema,
    );
  }

  async removeProjectRepository(
    projectId: number,
  ): Promise<Result<void, RustrakError>> {
    return this.requestVoid(() =>
      this.http.delete(`api/projects/${projectId}/github`),
    );
  }
}
