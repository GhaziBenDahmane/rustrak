import type {
  AuthorizationInfo,
  AuthorizationRequest,
  McpStatus,
  OAuthGrant,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

/** Whether the server answers MCP clients at `/mcp`. */
export async function getMcpSettings(): Promise<
  Result<McpStatus, RustrakError>
> {
  const client = await createClient();
  return client.settings.getMcp();
}

/** Verifies an assistant's authorization request and says who is asking. */
export async function getAuthorization(
  request: AuthorizationRequest,
): Promise<Result<AuthorizationInfo, RustrakError>> {
  const client = await createClient();
  return client.oauth.getAuthorization({ query: request });
}

/** The assistants connected to the signed-in user's account. */
export async function listConnections(): Promise<
  Result<OAuthGrant[], RustrakError>
> {
  const client = await createClient();
  return client.oauth.listGrants();
}
