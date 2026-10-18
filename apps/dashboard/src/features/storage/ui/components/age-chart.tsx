import { useMemo } from 'react';
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'use-intl';
import {
  type AgeBucket,
  KINDS,
  type Kind,
} from '@/features/storage/model/retention';
import { formatBytes } from '@/shared/lib/utils';
import {
  ChartLegend,
  ChartTooltipCaption,
  ChartTooltipRow,
  ChartTooltipSurface,
} from '@/shared/ui/components/chart-tooltip';

/** Fixed categorical slots, in order: the colour follows the kind. */
const COLOR: Record<Kind, string> = {
  events: 'var(--chart-1)',
  transactions: 'var(--chart-2)',
  logs: 'var(--chart-3)',
};

const HEIGHT = 260;

/**
 * Bytes by how long ago they arrived, stacked by kind. What the next cleanup
 * deletes is the hatched part of each bar, so the chart answers "what is
 * big, how old is it, and what goes" at once.
 */
export function AgeChart({
  buckets,
  kinds,
}: {
  buckets: readonly AgeBucket[];
  kinds: readonly Kind[];
}) {
  const t = useTranslations('storage');
  const labels = buckets.map((_, i) => t(`age.bucket${i}`));
  const data = useMemo(
    () =>
      buckets.map((b, i) => {
        const row: Record<string, number | string> = { label: labels[i] ?? '' };
        for (const kind of kinds) {
          row[`${kind}Kept`] = b[kind] - b.goes[kind];
          row[`${kind}Goes`] = b.goes[kind];
        }
        return row;
      }),
    [buckets, kinds, labels],
  );
  const anyGoes = buckets.some((b) => kinds.some((k) => b.goes[k] > 0));
  const empty = !buckets.some((b) => kinds.some((k) => b[k] > 0));
  const Tip = useMemo(
    () => makeTooltip(buckets, kinds, labels, t),
    [buckets, kinds, labels, t],
  );

  if (empty) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height: HEIGHT }}
      >
        {t('age.empty')}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ResponsiveContainer width="100%" height={HEIGHT} debounce={80}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {KINDS.map((kind) => (
              <pattern
                key={kind}
                id={`storage-hatch-${kind}`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill={COLOR[kind]} opacity={0.25} />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke={COLOR[kind]}
                  strokeWidth="3"
                />
              </pattern>
            ))}
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            // Drops the labels that would overlap on a narrow screen; the
            // tooltip names every bucket.
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={(v) => formatBytes(Number(v))}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={76}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={<Tip />}
          />
          {kinds.flatMap((kind) => [
            <Bar
              key={`${kind}Kept`}
              dataKey={`${kind}Kept`}
              stackId="age"
              fill={COLOR[kind]}
              stroke="var(--card)"
              strokeWidth={1}
              maxBarSize={56}
              isAnimationActive={false}
            />,
            <Bar
              key={`${kind}Goes`}
              dataKey={`${kind}Goes`}
              stackId="age"
              fill={`url(#storage-hatch-${kind})`}
              stroke="var(--card)"
              strokeWidth={1}
              maxBarSize={56}
              isAnimationActive={false}
            />,
          ])}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartLegend
          items={kinds.map((k) => ({ label: t(`kind.${k}`), color: COLOR[k] }))}
        />
        {anyGoes && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {/* Neutral: the hatch means "goes" whatever the kind. */}
            <span
              aria-hidden
              className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1.5px,transparent_1.5px_3.5px)]"
            />
            {t('age.goes')}
          </span>
        )}
      </div>
      {/* The bars as a table, for screen readers. */}
      {/* In a box: a table keeps its content width even when sr-only. */}
      <div className="sr-only">
        <table>
          <caption>{t('age.title')}</caption>
          <thead>
            <tr>
              <th>{t('age.age')}</th>
              {kinds.map((k) => (
                <th key={k}>{t(`kind.${k}`)}</th>
              ))}
              <th>{t('age.goes')}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => (
              <tr key={labels[i]}>
                <td>{labels[i]}</td>
                {kinds.map((k) => (
                  <td key={k}>{formatBytes(b[k])}</td>
                ))}
                <td>{formatBytes(kinds.reduce((s, k) => s + b.goes[k], 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function makeTooltip(
  buckets: readonly AgeBucket[],
  kinds: readonly Kind[],
  labels: readonly string[],
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return function AgeTooltip(props: {
    active?: boolean;
    payload?: Array<{ payload: { label: string } }>;
  }) {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;
    const label = payload[0]?.payload.label ?? '';
    const bucket = buckets[labels.indexOf(label)];
    if (!bucket) return null;
    const goes = kinds.reduce((s, k) => s + bucket.goes[k], 0);
    return (
      <ChartTooltipSurface>
        <p className="mb-1 font-medium text-popover-foreground">{label}</p>
        {kinds.map((k) => (
          <ChartTooltipRow
            key={k}
            color={COLOR[k]}
            label={t(`kind.${k}`)}
            value={formatBytes(bucket[k])}
          />
        ))}
        {goes > 0 && (
          <ChartTooltipCaption>
            {t('age.goesInBucket', { size: formatBytes(goes) })}
          </ChartTooltipCaption>
        )}
      </ChartTooltipSurface>
    );
  };
}
