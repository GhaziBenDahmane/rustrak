import type { z } from 'zod';
import type {
  codeMappingSchema,
  gitHubInstallationSchema,
  gitHubManifestSchema,
  gitHubRepositorySchema,
  gitHubStatusSchema,
  issueGitHubSchema,
  issueLinkSchema,
  projectRepositorySchema,
  repoCommitSchema,
  updateProjectRepositorySchema,
} from '../schemas/github.js';

export type GitHubStatus = z.infer<typeof gitHubStatusSchema>;
export type GitHubInstallation = z.infer<typeof gitHubInstallationSchema>;
export type GitHubManifest = z.infer<typeof gitHubManifestSchema>;
export type GitHubRepository = z.infer<typeof gitHubRepositorySchema>;
export type CodeMapping = z.infer<typeof codeMappingSchema>;
export type ProjectRepository = z.infer<typeof projectRepositorySchema>;
export type UpdateProjectRepository = z.infer<
  typeof updateProjectRepositorySchema
>;
export type IssueLink = z.infer<typeof issueLinkSchema>;
export type RepoCommit = z.infer<typeof repoCommitSchema>;
export type IssueGitHub = z.infer<typeof issueGitHubSchema>;
