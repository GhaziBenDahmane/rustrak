import type {
  AlertIntegration,
  AlertRuleResponse,
  CreateAlertIntegration,
  CreateAlertRule,
  PreviewTemplateResponse,
  Result,
  RustrakError,
  TestChannelResponse,
  UpdateAlertIntegration,
  UpdateAlertRule,
} from '@rustrak/client';
import { createClient } from '@/shared/api/rustrak';

// ============================================================================
// Alert Integrations (Global Credential Destinations)
// ============================================================================

export async function createIntegration(
  input: CreateAlertIntegration,
): Promise<Result<AlertIntegration, RustrakError>> {
  const client = await createClient();
  return client.alertChannels.create({ body: input });
}

export async function updateIntegration(
  id: number,
  input: UpdateAlertIntegration,
): Promise<Result<AlertIntegration, RustrakError>> {
  const client = await createClient();
  return client.alertChannels.update({ path: { id }, body: input });
}

export async function deleteIntegration(
  id: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.alertChannels.delete({ path: { id } });
}

export async function testIntegration(
  id: number,
  routingOverride?: Record<string, unknown>,
): Promise<Result<TestChannelResponse, RustrakError>> {
  const client = await createClient();
  return client.alertChannels.test({
    path: { id },
    body:
      routingOverride === undefined
        ? undefined
        : { routing_override: routingOverride },
  });
}

/**
 * Render a Custom Webhook body template against a sample payload.
 *
 * The dashboard cannot run the template engine, so the preview under the
 * editor comes from the server: the same renderer a delivery uses, which is
 * the only way the preview cannot lie about what will be sent.
 */
export async function previewTemplate(
  template: string,
): Promise<Result<PreviewTemplateResponse, RustrakError>> {
  const client = await createClient();
  return client.alertChannels.previewTemplate({ body: { template } });
}

// ============================================================================
// Alert Rules (Per-Project Alert Configuration)
// ============================================================================

export async function createAlertRule(
  projectId: number,
  input: CreateAlertRule,
): Promise<Result<AlertRuleResponse, RustrakError>> {
  const client = await createClient();
  return client.alertRules.create({
    path: { project_id: projectId },
    body: input,
  });
}

export async function updateAlertRule(
  projectId: number,
  ruleId: number,
  input: UpdateAlertRule,
): Promise<Result<AlertRuleResponse, RustrakError>> {
  const client = await createClient();
  return client.alertRules.update({
    path: { project_id: projectId, rule_id: ruleId },
    body: input,
  });
}

export async function deleteAlertRule(
  projectId: number,
  ruleId: number,
): Promise<Result<void, RustrakError>> {
  const client = await createClient();
  return client.alertRules.delete({
    path: { project_id: projectId, rule_id: ruleId },
  });
}
