import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RustrakClient } from '@rustrak/client';
import { z } from 'zod';
import { mcpJson } from '../errors.js';

export function registerAlertTools(
  server: McpServer,
  client: RustrakClient,
): void {
  server.registerTool(
    'list_alert_channels',
    {
      description:
        'List all configured alert notification channels (Slack, email, webhook, custom webhook, etc.).',
      inputSchema: {},
    },
    async () => {
      const result = await client.alertIntegrations.list();
      return mcpJson(result);
    },
  );

  server.registerTool(
    'create_alert_channel',
    {
      description:
        'Create an alert notification channel. provider_type is one of slack, email, webhook, custom_webhook. ' +
        'credentials is provider-specific: a custom_webhook takes { template, url?, secret?, headers? } where template is the JSON body ' +
        'with alert fields written as {{ issue.title }}; values are escaped for wherever they sit. ' +
        'The server validates the credentials and renders the template against a sample alert before saving.',
      inputSchema: {
        name: z.string().min(1).describe('Channel name, unique'),
        provider_type: z
          .enum(['slack', 'email', 'webhook', 'custom_webhook'])
          .describe('Provider'),
        credentials: z
          .record(z.string(), z.unknown())
          .describe('Provider-specific credentials'),
        is_enabled: z
          .boolean()
          .optional()
          .describe('Whether alerts are delivered to it (default true)'),
      },
    },
    async ({ name, provider_type, credentials, is_enabled }) => {
      const result = await client.alertIntegrations.create({
        name,
        provider_type,
        credentials,
        ...(is_enabled === undefined ? {} : { is_enabled }),
      });
      return mcpJson(result);
    },
  );

  server.registerTool(
    'update_alert_channel',
    {
      description:
        'Update an alert notification channel. credentials, when given, replace the stored ones whole, ' +
        'so send every field the provider needs (for a custom_webhook, at least template).',
      inputSchema: {
        channel_id: z.number().int().describe('Alert channel ID'),
        name: z.string().min(1).optional().describe('New name'),
        credentials: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Replacement credentials'),
        is_enabled: z.boolean().optional().describe('Enable or disable'),
      },
    },
    async ({ channel_id, name, credentials, is_enabled }) => {
      const result = await client.alertIntegrations.update(channel_id, {
        ...(name === undefined ? {} : { name }),
        ...(credentials === undefined ? {} : { credentials }),
        ...(is_enabled === undefined ? {} : { is_enabled }),
      });
      return mcpJson(result);
    },
  );

  server.registerTool(
    'preview_alert_template',
    {
      description:
        'Render a custom_webhook body template against a sample alert and return the exact body that would be sent, ' +
        'or the reason it would be refused (invalid JSON, unknown field, syntax error). Use it before creating or updating a custom_webhook channel.',
      inputSchema: {
        template: z
          .string()
          .min(1)
          .describe('JSON body with {{ field }} expressions'),
      },
    },
    async ({ template }) => {
      const result = await client.alertIntegrations.previewTemplate(template);
      return mcpJson(result);
    },
  );

  server.registerTool(
    'test_alert_channel',
    {
      description:
        'Send a test notification to an alert channel to verify it is configured correctly.',
      inputSchema: {
        channel_id: z.number().int().describe('Alert channel ID to test'),
      },
    },
    async ({ channel_id }) => {
      const result = await client.alertIntegrations.test(channel_id);
      return mcpJson(result);
    },
  );

  server.registerTool(
    'list_alert_rules',
    {
      description: 'List all alert rules configured for a project.',
      inputSchema: {
        project_id: z.number().int().describe('Project ID'),
      },
    },
    async ({ project_id }) => {
      const result = await client.alertRules.list(project_id);
      return mcpJson(result);
    },
  );
}
