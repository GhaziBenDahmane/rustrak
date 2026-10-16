import type {
  AlertRuleConditions,
  CodeMapping,
  GitHubRepository,
  ProjectRepository,
  Result,
  RustrakError,
} from '@rustrak/client';
import { ArrowUpRight, Plus, RefreshCw, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useFormatter, useTranslations } from 'use-intl';
import {
  removeProjectRepository,
  setProjectRepository,
  syncCodeowners,
} from '@/features/github/api/mutations';
import { savableMappings } from '@/features/github/lib/code-mappings';
import {
  conditionsFromForm,
  formFromConditions,
} from '@/shared/lib/rule-conditions';
import { ConditionFilters } from '@/shared/ui/components/condition-filters';
import { Link } from '@/shared/ui/components/link';
import { SettingRow, SettingSection } from '@/shared/ui/components/setting-row';
import { Button } from '@/shared/ui/components/shadcn/button';
import { Input } from '@/shared/ui/components/shadcn/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/shadcn/select';
import { Switch } from '@/shared/ui/components/shadcn/switch';
import { useRouter } from '@/shared/ui/hooks/use-router';

interface RepositorySettingsProps {
  projectId: number;
  projectSlug: string;
  repository: ProjectRepository | null;
  repositories: Result<GitHubRepository[], RustrakError>;
}

/**
 * A project's repository, and what follows from it. Only the first row shows
 * until a repository is chosen: everything after it needs one.
 */
export function RepositorySettings({
  projectId,
  projectSlug,
  repository,
  repositories,
}: RepositorySettingsProps) {
  const t = useTranslations('github');
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (
    failure: string,
    action: () => Promise<Result<unknown, RustrakError>>,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(failure, { description: result.error.message });
        return;
      }
      router.refresh();
    });
  };

  const save = (changes: {
    repo?: GitHubRepository;
    code_mappings?: CodeMapping[];
    auto_create_issues?: boolean;
    auto_create_conditions?: AlertRuleConditions;
  }) =>
    run(t('repository.saveFailed'), () =>
      setProjectRepository(projectId, {
        installation_id:
          changes.repo?.installation_id ?? repository?.installation_id ?? 0,
        repo_full_name:
          changes.repo?.full_name ?? repository?.repo_full_name ?? '',
        code_mappings: changes.code_mappings ?? repository?.code_mappings,
        auto_create_issues:
          changes.auto_create_issues ?? repository?.auto_create_issues,
        auto_create_conditions:
          changes.auto_create_conditions ?? repository?.auto_create_conditions,
      }),
    );

  // Without the list the page still works for a repository already chosen:
  // GitHub being unreachable for a moment must not hide its settings.
  const choices = repositories.success ? repositories.data : [];
  const unavailable = !repositories.success && (
    <div className="mb-6 rounded-lg border border-dashed p-4 text-sm space-y-1.5">
      <p className="font-medium">{t('repository.unavailable')}</p>
      <p className="text-muted-foreground">
        {repositories.success ? null : repositories.error.message}
      </p>
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        {t('repository.goToIntegrations')}
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
  if (unavailable && !repository) return unavailable;

  return (
    <>
      {unavailable}
      <SettingSection title={t('repository.section')}>
        <SettingRow
          title={t('repository.repository')}
          description={t('repository.repositoryDescription')}
          htmlFor="github-repository"
        >
          <Select
            value={repository?.repo_full_name ?? ''}
            onValueChange={(value) => {
              const repo = choices.find((r) => r.full_name === value);
              if (repo) save({ repo });
            }}
            disabled={isPending || choices.length === 0}
          >
            <SelectTrigger id="github-repository" className="w-full">
              <SelectValue
                placeholder={
                  choices.length === 0
                    ? t('repository.noRepositories')
                    : t('repository.choose')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {choices.map((repo) => (
                <SelectItem key={repo.full_name} value={repo.full_name}>
                  {repo.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {repository && (
            <a
              href={repository.html_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {t('repository.openOnGitHub', {
                branch: repository.default_branch,
              })}
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </SettingRow>
      </SettingSection>

      {repository && (
        <>
          <SettingSection title={t('repository.stackTraces')}>
            <SettingRow
              title={t('repository.mappings')}
              description={t('repository.mappingsDescription')}
            >
              <PathMappings
                // A new key per saved value starts the draft again from it,
                // so what the server kept (empty rows dropped) is what shows.
                key={JSON.stringify(repository.code_mappings)}
                saved={repository.code_mappings}
                disabled={isPending}
                onSave={(code_mappings) => save({ code_mappings })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection title={t('repository.issues')}>
            <SettingRow
              title={t('repository.autoCreate')}
              description={t('repository.autoCreateDescription')}
              htmlFor="github-auto-create"
            >
              <Switch
                id="github-auto-create"
                checked={repository.auto_create_issues}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  save({ auto_create_issues: checked })
                }
              />
            </SettingRow>
            {repository.auto_create_issues && (
              <SettingRow
                title={t('repository.autoCreateFilters')}
                description={t('repository.autoCreateFiltersDescription')}
              >
                <AutoCreateFilters
                  saved={repository.auto_create_conditions}
                  disabled={isPending}
                  onSave={(auto_create_conditions) =>
                    save({ auto_create_conditions })
                  }
                />
              </SettingRow>
            )}
            <SettingRow
              title={t('repository.fixes')}
              description={t('repository.fixesDescription')}
            >
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                Fixes {projectSlug.toUpperCase()}-123
              </code>
            </SettingRow>
            <SettingRow
              title={t('repository.codeowners')}
              description={t('repository.codeownersDescription')}
            >
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(t('repository.codeownersFailed'), () =>
                      syncCodeowners(projectId),
                    )
                  }
                >
                  <RefreshCw />
                  {t('repository.codeownersSync')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {repository.codeowners_synced_at
                    ? t('repository.codeownersStatus', {
                        count: repository.codeowners_rules ?? 0,
                        when: format.relativeTime(
                          new Date(repository.codeowners_synced_at),
                        ),
                      })
                    : t('repository.codeownersNever')}
                </span>
              </div>
            </SettingRow>
          </SettingSection>

          <SettingSection title={t('repository.danger')} destructive>
            <SettingRow
              title={t('repository.disconnect')}
              description={t('repository.disconnectDescription')}
            >
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(t('repository.saveFailed'), () =>
                    removeProjectRepository(projectId),
                  )
                }
              >
                {t('repository.disconnect')}
              </Button>
            </SettingRow>
          </SettingSection>
        </>
      )}
    </>
  );
}

/** The path mapping rows, edited locally and saved together. */
function PathMappings({
  saved,
  disabled,
  onSave,
}: {
  saved: CodeMapping[];
  disabled: boolean;
  onSave: (mappings: CodeMapping[]) => void;
}) {
  const t = useTranslations('github');
  // A draft of `saved`, not a copy to keep in step: the parent keys this
  // component on `saved`, so a new saved value starts a new draft.
  // react-doctor-disable-next-line react-doctor/no-derived-useState
  const [mappings, setMappings] = useState<CodeMapping[]>(saved);
  const changed = JSON.stringify(mappings) !== JSON.stringify(saved);
  const update = (index: number, change: Partial<CodeMapping>) =>
    setMappings(
      mappings.map((m, i) => (i === index ? { ...m, ...change } : m)),
    );

  return (
    <div className="space-y-2">
      {mappings.map((mapping, index) => (
        // Rows are controlled inputs with no identity of their own; the
        // position is the row, and removing one re-renders from state.
        // react-doctor-disable-next-line react-doctor/no-array-index-as-key
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={mapping.stack_root}
            placeholder="/app/"
            aria-label={t('repository.stackRoot')}
            className="font-mono text-xs"
            onChange={(e) => update(index, { stack_root: e.target.value })}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            value={mapping.source_root}
            placeholder="src/"
            aria-label={t('repository.sourceRoot')}
            className="font-mono text-xs"
            onChange={(e) => update(index, { source_root: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('repository.removeMapping')}
            onClick={() => setMappings(mappings.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setMappings([...mappings, { stack_root: '', source_root: '' }])
          }
        >
          <Plus />
          {t('repository.addMapping')}
        </Button>
        {changed && (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onSave(savableMappings(mappings))}
          >
            {t('save')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The automatic issues' filters, edited locally and saved together. */
function AutoCreateFilters({
  saved,
  disabled,
  onSave,
}: {
  saved: AlertRuleConditions;
  disabled: boolean;
  onSave: (conditions: AlertRuleConditions) => void;
}) {
  const t = useTranslations('github');
  const [filters, setFilters] = useState(() => formFromConditions(saved));
  const conditions = conditionsFromForm({
    alert_type: 'new_issue',
    ...filters,
  });
  const changed =
    JSON.stringify(conditions) !==
    JSON.stringify(
      conditionsFromForm({
        alert_type: 'new_issue',
        ...formFromConditions(saved),
      }),
    );

  return (
    <div className="space-y-3">
      <ConditionFilters
        value={filters}
        onChange={setFilters}
        showMinEvents
        disabled={disabled}
      />
      {changed && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onSave(conditions)}
          >
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
