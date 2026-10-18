import { useTranslations } from 'use-intl';
import { presetsWith } from '@/features/storage/model/retention';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/shadcn/select';

const FOREVER = 'forever';

/** How long a kind of data is kept: a few presets, or forever. */
export function KeepForSelect({
  id,
  value,
  onChange,
  disabled,
  label,
}: {
  id?: string;
  value: number | null;
  onChange: (days: number | null) => void;
  disabled?: boolean;
  /** Names the select when no visible label points at it. */
  label?: string;
}) {
  const t = useTranslations('storage');
  const name = (option: string) =>
    option === FOREVER
      ? t('keep.forever')
      : t('keep.days', { count: Number(option) });

  return (
    <Select
      value={value === null ? FOREVER : String(value)}
      onValueChange={(option) => {
        if (option === null) return;
        onChange(option === FOREVER ? null : Number(option));
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-label={label}>
        <SelectValue>{(option: string) => name(option)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {presetsWith(value).map((days) => {
          const option = days === null ? FOREVER : String(days);
          return (
            <SelectItem key={option} value={option}>
              {name(option)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
