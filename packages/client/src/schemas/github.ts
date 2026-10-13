import { z } from 'zod';
import { dateTimeSchema } from './common.js';

export const gitHubAppSchema = z.object({
  app_id: z.number().int(),
  slug: z.string(),
  html_url: z.string(),
  owner_login: z.string(),
  install_url: z.string(),
  last_webhook_at: dateTimeSchema.nullable(),
  created_at: dateTimeSchema,
});

export const gitHubInstallationSchema = z.object({
  id: z.number().int(),
  account_login: z.string(),
  account_type: z.string(),
  suspended: z.boolean(),
  created_at: dateTimeSchema,
});

export const gitHubStatusSchema = z.object({
  app: gitHubAppSchema.nullable(),
  installations: z.array(gitHubInstallationSchema),
  webhook_url: z.string(),
});

export const gitHubManifestSchema = z.object({
  action_url: z.string(),
  manifest: z.string(),
});

export const gitHubRepositorySchema = z.object({
  installation_id: z.number().int(),
  full_name: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
  html_url: z.string(),
});

export const codeMappingSchema = z.object({
  stack_root: z.string(),
  source_root: z.string(),
});

export const projectRepositorySchema = z.object({
  project_id: z.number().int(),
  installation_id: z.number().int(),
  repo_full_name: z.string(),
  default_branch: z.string(),
  html_url: z.string(),
  code_mappings: z.array(codeMappingSchema),
});

export const updateProjectRepositorySchema = z.object({
  installation_id: z.number().int(),
  repo_full_name: z.string().min(1),
  code_mappings: z.array(codeMappingSchema).optional(),
});
