import type { AlertRuleConditions, AlertType } from '@rustrak/client';

export const levels = ['debug', 'info', 'warning', 'error', 'fatal'] as const;

/** The filters as the rule dialog edits them: plain values, no absences. */
export interface FilterFields {
  min_level: (typeof levels)[number] | 'any';
  /** Comma-separated. */
  environments: string;
  min_events: number;
}

/**
 * The conditions a rule is saved with. A filter left at its default is not
 * sent, and the event count only means something for new issues.
 */
export function conditionsFromForm(
  form: FilterFields & { alert_type: AlertType },
): AlertRuleConditions {
  const environments = form.environments
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return {
    ...(form.min_level !== 'any' && { min_level: form.min_level }),
    ...(environments.length > 0 && { environments }),
    ...(form.alert_type === 'new_issue' &&
      form.min_events > 1 && { min_events: form.min_events }),
  };
}

export function formFromConditions(
  conditions: AlertRuleConditions,
): FilterFields {
  return {
    min_level: conditions.min_level ?? 'any',
    environments: (conditions.environments ?? []).join(', '),
    min_events: conditions.min_events ?? 1,
  };
}
