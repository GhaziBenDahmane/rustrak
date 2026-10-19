/**
 * Reads for the alert feature: the rules a project has, and the integrations
 * they route to. A rule without an integration does nothing, which is why the
 * two live in one slice.
 */
import type {
  AlertIntegration,
  AlertRuleResponse,
  Result,
  RustrakError,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

// ============================================================================
// Alert Integrations (Global Credential Destinations)
// ============================================================================

export async function listIntegrations(): Promise<
  Result<AlertIntegration[], RustrakError>
> {
  const client = await createClient();
  return client.alertChannels.list();
}

export async function listAlertRules(
  projectId: number,
): Promise<Result<AlertRuleResponse[], RustrakError>> {
  const client = await createClient();
  return client.alertRules.list({ path: { project_id: projectId } });
}
