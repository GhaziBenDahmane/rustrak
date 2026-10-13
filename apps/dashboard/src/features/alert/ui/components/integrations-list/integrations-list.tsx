import type { AlertIntegration, ProviderType } from '@rustrak/client';
import { Bell } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  deleteIntegration,
  testIntegration,
} from '@/features/alert/api/mutations';
import { alertProviders } from '@/features/alert/model/providers';
import { ConfirmDeleteDialog } from '@/features/alert/ui/components/confirm-delete-dialog';
import { IntegrationConfigDialog } from '@/features/alert/ui/components/integration-config-dialog/integration-config-dialog';
import { ProviderIcon } from '@/features/alert/ui/components/provider-icon';
import type { Translate } from '@/shared/lib/error-copy';
import {
  IntegrationSection,
  IntegrationTile,
} from '@/shared/ui/components/integration-section';
import { useRouter } from '@/shared/ui/hooks/use-router';
import { ManageDialog } from './manage-dialog';

// Active alert notification providers
interface IntegrationsListProps {
  initialIntegrations: AlertIntegration[];
}

export function IntegrationsList({
  initialIntegrations,
}: IntegrationsListProps) {
  const t = useTranslations('alerts');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [configureType, setConfigureType] = useState<ProviderType | null>(null);
  const [manageType, setManageType] = useState<ProviderType | null>(null);
  const [editIntegration, setEditIntegration] =
    useState<AlertIntegration | null>(null);
  const [deleteIntegrationItem, setDeleteIntegrationItem] =
    useState<AlertIntegration | null>(null);

  const getIntegrationsByType = (type: ProviderType) =>
    initialIntegrations.filter((c) => c.provider_type === type);

  const handleTest = (
    integration: AlertIntegration,
    routingOverride?: Record<string, unknown>,
  ) => {
    startTransition(async () => {
      const result = await testIntegration(integration.id, routingOverride);

      if (!result.success) {
        // The request itself failed. Distinct from the delivery result below,
        // which is a successful request reporting that the provider refused.
        toast.error(t('integrations.testFailed'), {
          description: result.error.message,
        });
        return;
      }

      if (!result.data.success) {
        toast.error(t('integrations.testFailedResult'), {
          description: result.data.message,
        });
        return;
      }

      // The request reached the endpoint. Whether the endpoint was happy about
      // it is its own business: Rustrak judges delivery by the HTTP status and
      // never interprets the body, so an answer it cannot read must not be
      // dressed as a success. A tick over `{"errcode":93000}` reads as a lie.
      // Neutral when there is something to read, success only when the 2xx is
      // genuinely all there was.
      if (result.data.response_body) {
        toast.info(t('integrations.testAnswered'), {
          description: result.data.response_body,
        });
        return;
      }

      toast.success(t('integrations.testSent'));
    });
  };

  const handleDelete = () => {
    if (!deleteIntegrationItem) return;
    startTransition(async () => {
      const result = await deleteIntegration(deleteIntegrationItem.id);

      if (!result.success) {
        toast.error(t('integrations.deleteFailed'), {
          description: result.error.message,
        });
        return;
      }

      toast.success(t('integrations.deleted'));
      const remaining = initialIntegrations.filter(
        (i) =>
          i.provider_type === deleteIntegrationItem.provider_type &&
          i.id !== deleteIntegrationItem.id,
      );
      if (remaining.length === 0) setManageType(null);
      setDeleteIntegrationItem(null);
      setConfigureType(null);
      setEditIntegration(null);
      router.refresh();
    });
  };

  const handleCardClick = (type: ProviderType) => {
    const instances = getIntegrationsByType(type);
    if (instances.length >= 1) {
      setManageType(type);
    } else {
      setEditIntegration(null);
      setConfigureType(type);
    }
  };

  const handleEditFromManage = (integration: AlertIntegration) => {
    setManageType(null);
    setEditIntegration(integration);
    setConfigureType(integration.provider_type);
  };

  const handleAddFromManage = (type: ProviderType) => {
    setManageType(null);
    setEditIntegration(null);
    setConfigureType(type);
  };

  const closeConfigure = () => {
    setConfigureType(null);
    setEditIntegration(null);
  };

  const alertConfiguredCount = alertProviders.filter(
    (p) => getIntegrationsByType(p.type).length > 0,
  ).length;

  return (
    <div className="space-y-3">
      <IntegrationSection
        icon={<Bell className="size-4" />}
        iconClassName="bg-orange-500/10 text-orange-500"
        title={t('integrations.title')}
        description={t('integrations.description')}
        badge={
          alertConfiguredCount > 0
            ? t('integrations.configuredCount', { count: alertConfiguredCount })
            : undefined
        }
      >
        {alertProviders.map((providerDef) => (
          <ProviderCard
            key={providerDef.type}
            providerDef={providerDef}
            instances={getIntegrationsByType(providerDef.type)}
            onOpen={handleCardClick}
          />
        ))}
      </IntegrationSection>

      {/* Manage dialog — shown when 1+ instances exist */}
      {alertProviders.map((providerDef) => {
        const instances = getIntegrationsByType(providerDef.type);
        return (
          <ManageDialog
            key={providerDef.type}
            open={manageType === providerDef.type}
            onOpenChange={(open) => !open && setManageType(null)}
            providerDef={providerDef}
            instances={instances}
            onEdit={handleEditFromManage}
            onAdd={() => handleAddFromManage(providerDef.type)}
            onDelete={(i) => setDeleteIntegrationItem(i)}
          />
        );
      })}

      <IntegrationConfigDialog
        provider={configureType}
        onOpenChange={(open) => !open && closeConfigure()}
        existingIntegration={editIntegration}
        onTest={handleTest}
        onDelete={(integration) => setDeleteIntegrationItem(integration)}
        isPending={isPending}
      />

      <ConfirmDeleteDialog
        open={!!deleteIntegrationItem}
        title={t('integrations.deleteTitle')}
        description={t('integrations.deleteDescription', {
          name: deleteIntegrationItem?.name ?? '',
        })}
        isPending={isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleteIntegrationItem(null)}
      />
    </div>
  );
}

/** What a provider's tile has to say, from the integrations it holds. */
interface ProviderStatus {
  count: number;
  /**
   * The one integration this provider has, or `null`.
   *
   * A tile with several has room for a count and nothing else, so it cannot
   * name one or report whether it is on.
   */
  single: AlertIntegration | null;
  isConnected: boolean;
  isDisabled: boolean;
}

function providerStatus(
  instances: readonly AlertIntegration[],
): ProviderStatus {
  const count = instances.length;
  const single = count === 1 ? (instances[0] ?? null) : null;

  return {
    count,
    single,
    isConnected: !!single && single.is_enabled,
    isDisabled: !!single && !single.is_enabled,
  };
}

function statusLabel(status: ProviderStatus, t: Translate): string {
  if (status.count === 0) return t('integrations.notConfigured');
  if (status.count > 1) {
    return t('integrations.configuredCount', { count: status.count });
  }
  return status.isConnected
    ? t('integrations.connected')
    : t('integrations.disabled');
}

interface ProviderCardProps {
  providerDef: (typeof alertProviders)[number];
  instances: readonly AlertIntegration[];
  onOpen: (type: ProviderType) => void;
}

/** One provider tile: its mark, its state, and the way into its dialog. */
function ProviderCard({ providerDef, instances, onOpen }: ProviderCardProps) {
  const t = useTranslations('alerts');
  const status = providerStatus(instances);

  return (
    <IntegrationTile
      icon={<ProviderIcon type={providerDef.type} className="size-5" />}
      color={providerDef.color}
      name={providerDef.name}
      description={
        status.single ? status.single.name : t(providerDef.descriptionKey)
      }
      status={statusLabel(status, t)}
      connected={status.isConnected}
      disabled={status.isDisabled}
      empty={status.count === 0}
      action={
        status.count === 0
          ? t('integrations.configure')
          : t('integrations.manage')
      }
      ariaLabel={t('integrations.configureAria', { name: providerDef.name })}
      onOpen={() => onOpen(providerDef.type)}
    />
  );
}
