/**
 * How long a run took, at the precision a job's runtime is read at: a
 * nightly backup is "1h 5m", not "3,900,000 ms". Rounded to the smaller unit
 * before it is split, so a remainder never reads "60s".
 */
export function formatRunDuration(ms: number): string {
  if (Math.round(ms) < 1_000) return `${Math.round(ms)}ms`;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${tenths / 10}s`;
  const seconds = Math.round(ms / 1_000);
  const [total, perUnit, bigUnit, smallUnit] =
    seconds < 3_600
      ? [seconds, 60, 'm', 's']
      : [Math.round(ms / 60_000), 60, 'h', 'm'];
  const big = Math.floor(total / perUnit);
  const small = total % perUnit;
  return small ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`;
}
