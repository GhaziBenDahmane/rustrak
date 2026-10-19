/**
 * X-axis geometry and labels for charts over time buckets.
 *
 * A numeric time axis with `domain={['dataMin', 'dataMax']}` puts the first
 * and last bar *centres* on the plot edges, so half of the first bar is drawn
 * over the y-axis labels and half of the last one past the end of the SVG.
 * The edge tick labels have nowhere to go either, so recharts drops them:
 * with two days of data the chart shows two half-bars and one date.
 *
 * Bars get the domain padded by half a bucket on each side, so every bar has
 * its full width inside the plot. Lines and areas can end on the edge, so
 * they keep the data's own range. Both tick at the bucket starts, which keeps
 * each label under its own bucket instead of at a "nice" time none sits on.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Width of one bucket in milliseconds: the requested interval (in hours)
 * when the caller knows it, else the narrowest gap between points, else an
 * hour (a single point has no spacing to read).
 */
export function bucketWidth(times: number[], intervalHours?: number): number {
  if (intervalHours != null && intervalHours > 0) {
    return intervalHours * HOUR_MS;
  }

  let narrowest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i++) {
    narrowest = Math.min(narrowest, times[i] - times[i - 1]);
  }
  return Number.isFinite(narrowest) && narrowest > 0 ? narrowest : HOUR_MS;
}

export interface TimeAxis {
  domain: [number, number];
  ticks: number[];
  /** Named `dateTime` format: a day-wide bucket has no time of day to show. */
  format: 'axisDay' | 'axisTime';
  /** Named `dateTime` format for the tooltip's "period starting" line. */
  captionFormat: 'date' | 'dateTime';
  /**
   * Passed with both formats. Day-wide buckets cut at midnight UTC (the
   * server buckets on the epoch) are read in UTC: in a reader's zone west of
   * UTC that midnight falls on the previous date, and the Oct 19 bucket would
   * be labelled Oct 18. Rolling days, which start at whatever time "now" was,
   * keep the reader's zone, since no zone makes them whole days.
   */
  zone: { timeZone: 'UTC' } | undefined;
}

function labels(
  times: number[],
  bucketMs: number,
): Pick<TimeAxis, 'format' | 'captionFormat' | 'zone'> {
  const dayWide = bucketMs >= DAY_MS;
  const utcDays = dayWide && times.every((t) => t % DAY_MS === 0);
  return {
    format: dayWide ? 'axisDay' : 'axisTime',
    captionFormat: dayWide ? 'date' : 'dateTime',
    zone: utcDays ? { timeZone: 'UTC' } : undefined,
  };
}

function padded(times: number[], pad: number): [number, number] {
  return times.length > 0
    ? [times[0] - pad, times[times.length - 1] + pad]
    : [0, 0];
}

/** For bar charts. `times` must be ascending, one entry per bar. */
export function timeBarAxis(times: number[], bucketMs: number): TimeAxis {
  return {
    domain: padded(times, bucketMs / 2),
    ticks: times,
    ...labels(times, bucketMs),
  };
}

/** For line and area charts. `times` must be ascending, one entry per point. */
export function timeLineAxis(times: number[], bucketMs: number): TimeAxis {
  return {
    domain: padded(times, 0),
    ticks: times,
    ...labels(times, bucketMs),
  };
}
