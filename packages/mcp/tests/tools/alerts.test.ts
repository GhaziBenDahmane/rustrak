import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestEnv, ok } from '../setup.js';

describe('alert tools', () => {
  let mockClient: any;
  let testEnv: Awaited<ReturnType<typeof createTestEnv>>;
  let callTool: Awaited<ReturnType<typeof createTestEnv>>['callTool'];

  beforeEach(async () => {
    mockClient = {
      alertIntegrations: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        previewTemplate: vi.fn(),
        test: vi.fn(),
      },
      alertRules: {
        list: vi.fn(),
      },
    };
    testEnv = await createTestEnv(mockClient);
    callTool = testEnv.callTool;
  });

  afterEach(async () => {
    await testEnv.mcpClient.close();
  });

  describe('list_alert_channels', () => {
    it('returns all alert notification channels', async () => {
      const mockChannels = [
        {
          id: 1,
          name: 'Slack #errors',
          channel_type: 'slack',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockClient.alertIntegrations.list.mockResolvedValue(ok(mockChannels));

      const result = await callTool({
        name: 'list_alert_channels',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].channel_type).toBe('slack');
    });
  });

  describe('create_alert_channel', () => {
    it('creates a custom webhook channel with its template', async () => {
      const created = {
        id: 7,
        name: 'Ops chat bridge',
        provider_type: 'custom_webhook',
        is_enabled: true,
      };
      mockClient.alertIntegrations.create.mockResolvedValue(ok(created));

      const result = await callTool({
        name: 'create_alert_channel',
        arguments: {
          name: 'Ops chat bridge',
          provider_type: 'custom_webhook',
          credentials: {
            url: 'https://example.com/hook',
            template: '{"text": "{{ issue.title }}"}',
          },
        },
      });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text).provider_type).toBe(
        'custom_webhook',
      );
      // is_enabled was not given, so it is not sent either: the server's
      // default applies rather than an invented one.
      expect(mockClient.alertIntegrations.create).toHaveBeenCalledWith({
        name: 'Ops chat bridge',
        provider_type: 'custom_webhook',
        credentials: {
          url: 'https://example.com/hook',
          template: '{"text": "{{ issue.title }}"}',
        },
      });
    });

    it('rejects a provider the server does not know', async () => {
      const result = await callTool({
        name: 'create_alert_channel',
        arguments: {
          name: 'x',
          provider_type: 'pager',
          credentials: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(mockClient.alertIntegrations.create).not.toHaveBeenCalled();
    });
  });

  describe('update_alert_channel', () => {
    it('sends only the fields that were given', async () => {
      mockClient.alertIntegrations.update.mockResolvedValue(
        ok({ id: 7, is_enabled: false }),
      );

      const result = await callTool({
        name: 'update_alert_channel',
        arguments: { channel_id: 7, is_enabled: false },
      });

      expect(result.isError).toBeFalsy();
      expect(mockClient.alertIntegrations.update).toHaveBeenCalledWith(7, {
        is_enabled: false,
      });
    });
  });

  describe('preview_alert_template', () => {
    it('returns what the template renders to', async () => {
      mockClient.alertIntegrations.previewTemplate.mockResolvedValue(
        ok({ ok: true, rendered: '{"text": "Sample issue"}' }),
      );

      const result = await callTool({
        name: 'preview_alert_template',
        arguments: { template: '{"text": "{{ issue.title }}"}' },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ok).toBe(true);
      expect(parsed.rendered).toContain('Sample issue');
      expect(mockClient.alertIntegrations.previewTemplate).toHaveBeenCalledWith(
        '{"text": "{{ issue.title }}"}',
      );
    });

    it('hands back the refusal as data, not as a tool error', async () => {
      // A template the server would refuse is an answer, not a failure of
      // the call: the agent reads why and fixes the body.
      mockClient.alertIntegrations.previewTemplate.mockResolvedValue(
        ok({ ok: false, error: '`issue.titel` is not a field' }),
      );

      const result = await callTool({
        name: 'preview_alert_template',
        arguments: { template: '{"text": "{{ issue.titel }}"}' },
      });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text).ok).toBe(false);
    });
  });

  describe('test_alert_channel', () => {
    it('sends a test notification to the channel', async () => {
      const mockResponse = { success: true, message: 'Test notification sent' };
      mockClient.alertIntegrations.test.mockResolvedValue(ok(mockResponse));

      const result = await callTool({
        name: 'test_alert_channel',
        arguments: { channel_id: 1 },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockClient.alertIntegrations.test).toHaveBeenCalledWith(1);
    });
  });

  describe('list_alert_rules', () => {
    it('returns alert rules for a project', async () => {
      const mockRules = [
        {
          id: 1,
          project_id: 42,
          channel_id: 1,
          alert_type: 'new_issue',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockClient.alertRules.list.mockResolvedValue(ok(mockRules));

      const result = await callTool({
        name: 'list_alert_rules',
        arguments: { project_id: 42 },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].alert_type).toBe('new_issue');
      expect(mockClient.alertRules.list).toHaveBeenCalledWith(42);
    });
  });
});
