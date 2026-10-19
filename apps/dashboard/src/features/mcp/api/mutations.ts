import type {
  AuthorizationRedirect,
  AuthorizationRequest,
  McpStatus,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/** Opens or closes `/mcp`. Instance admins only; anyone else gets a 403. */
export async function updateMcpSettings(
  enabled: boolean,
): Promise<Result<McpStatus, RustrakError>> {
  const client = await createClient();
  return client.settings.updateMcp({ body: { enabled } });
}

/** Answers a consent screen; the server says where to send the browser. */
export async function decideAuthorization(
  request: AuthorizationRequest,
  approve: boolean,
): Promise<Result<AuthorizationRedirect, RustrakError>> {
  const client = await createClient();
  return client.oauth.decideAuthorization({ body: { ...request, approve } });
}

/** Disconnects an assistant: its tokens stop working at once. */
export async function revokeConnection(
  id: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.oauth.revokeGrant({ path: { id } });
}
