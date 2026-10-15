import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { type FilterFields, levels } from '@/shared/lib/rule-conditions';
import { Input } from '@/shared/ui/components/shadcn/input';
import { Label } from '@/shared/ui/components/shadcn/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/shadcn/select';

/**
 * What keeps an automatic action quiet: the quietest level that counts, the
 * environments that count, and how many events make a new issue worth it.
 * Alert rules and GitHub's automatic issues both use it.
 */
export function ConditionFilters({
  value,
  onChange,
  showMinEvents,
  disabled,
}: {
  value: FilterFields;
  onChange: (value: FilterFields) => void;
  showMinEvents: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('conditions');
  const [eventsDraft, setEventsDraft] = useState<string | null>(null);
  const set = (change: Partial<FilterFields>) =>
    onChange({ ...value, ...change });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="condition-level">{t('minLevel')}</Label>
          <Select
            value={value.min_level}
            onValueChange={(min_level) =>
              set({ min_level: min_level as FilterFields['min_level'] })
            }
            disabled={disabled}
          >
            <SelectTrigger id="condition-level" className="w-full">
              <SelectValue>
                {(selected) =>
                  selected === 'any'
                    ? t('anyLevel')
                    : t('levelOrAbove', { level: String(selected) })
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('anyLevel')}</SelectItem>
              {levels.map((level) => (
                <SelectItem key={level} value={level}>
                  {t('levelOrAbove', { level })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showMinEvents && (
          <div className="space-y-2">
            <Label htmlFor="condition-events">{t('minEvents')}</Label>
            <Input
              id="condition-events"
              type="number"
              min={1}
              value={eventsDraft ?? value.min_events}
              disabled={disabled}
              onChange={(e) => {
                // Hold what is typed, even an empty field, until it is a count.
                setEventsDraft(e.target.value);
                const count = parseInt(e.target.value, 10);
                if (count >= 1) set({ min_events: count });
              }}
              onBlur={() => setEventsDraft(null)}
            />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="condition-environments">{t('environments')}</Label>
        <Input
          id="condition-environments"
          placeholder="production"
          value={value.environments}
          disabled={disabled}
          onChange={(e) => set({ environments: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>
    </div>
  );
}
