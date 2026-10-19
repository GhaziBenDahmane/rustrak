import { describe, expect, it } from 'vitest';
import { bucketWidth, timeBarAxis, timeLineAxis } from './time-axis';

const H = 3_600_000;
const D = 24 * H;

describe('bucketWidth', () => {
  it('prefers the interval the caller asked for', () => {
    expect(bucketWidth([0, 3 * D], D)).toBe(D);
  });

  it('falls back to the narrowest gap between points', () => {
    expect(bucketWidth([0, 3 * D, 4 * D])).toBe(D);
  });

  it('falls back to an hour for a single point', () => {
    expect(bucketWidth([5 * D])).toBe(H);
  });
});

describe('timeBarAxis', () => {
  it('pads the domain by half a bucket so edge bars stay inside the plot', () => {
    const axis = timeBarAxis([D, 2 * D], D);
    expect(axis.domain).toEqual([D / 2, 2.5 * D]);
  });

  it('ticks at every bucket start', () => {
    expect(timeBarAxis([0, D, 2 * D], D).ticks).toEqual([0, D, 2 * D]);
  });

  it('drops the time of day for day-wide buckets', () => {
    expect(timeBarAxis([0], D).format).toBe('axisDay');
    expect(timeBarAxis([0], D).captionFormat).toBe('date');
    expect(timeBarAxis([0], 3 * H).format).toBe('axisTime');
    expect(timeBarAxis([0], 3 * H).captionFormat).toBe('dateTime');
  });

  it('reads day-wide buckets in UTC, where the server cut them', () => {
    expect(timeBarAxis([0], D).zone).toEqual({ timeZone: 'UTC' });
    expect(timeBarAxis([0], 2 * D).zone).toEqual({ timeZone: 'UTC' });
    expect(timeBarAxis([0], 12 * H).zone).toBeUndefined();
  });

  it('labels a UTC day with its own date west of UTC', () => {
    const oct19 = Date.UTC(2026, 9, 19);
    const label = (zone?: string) =>
      new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        timeZone: zone,
      }).format(oct19);

    // The bug: read in the reader's zone, the bar lands on the day before.
    expect(label('America/New_York')).toBe('Oct 18');
    expect(label(timeBarAxis([oct19], D).zone?.timeZone)).toBe('Oct 19');
  });

  it("keeps rolling days in the reader's zone", () => {
    // The issue stats start their days at "now", not at a UTC midnight.
    const rolling = [14 * H, D + 14 * H];
    expect(timeBarAxis(rolling, D).zone).toBeUndefined();
    expect(timeBarAxis(rolling, D).format).toBe('axisDay');
  });
});

describe('timeLineAxis', () => {
  it('ends on the first and last point, since a line can touch the edge', () => {
    expect(timeLineAxis([D, 2 * D, 3 * D], D).domain).toEqual([D, 3 * D]);
  });

  it('labels like the bar axis', () => {
    const axis = timeLineAxis([0, D], D);
    expect(axis.ticks).toEqual([0, D]);
    expect(axis.format).toBe('axisDay');
    expect(axis.zone).toEqual({ timeZone: 'UTC' });
  });
});
