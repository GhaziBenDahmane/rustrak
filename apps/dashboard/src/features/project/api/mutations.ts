import type {
  CreateProject,
  ProjectResponse,
  Result,
  RustrakError,
  UpdateProject,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/**
 * Create a new project.
 *
 * @param input - Project data (name, optional slug)
 * @returns The created project
 */
export async function createProject(
  input: CreateProject,
): Promise<Result<ProjectResponse, RustrakError>> {
  const client = await createClient();
  return client.projects.create({ body: input });
}

/**
 * Update an existing project.
 *
 * @param id - Project ID
 * @param input - Fields to update (name)
 * @returns The updated project
 */
export async function updateProject(
  id: number,
  input: UpdateProject,
): Promise<Result<ProjectResponse, RustrakError>> {
  const client = await createClient();
  return client.projects.update({ path: { id }, body: input });
}

/**
 * Delete a project.
 *
 * @param id - Project ID
 */
export async function deleteProject(
  id: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.projects.delete({ path: { id } });
}
