import { describe, expect, it } from 'vitest';
import { formatRunDuration } from './duration';

describe('formatRunDuration', () => {
  it('scales from milliseconds to hours', () => {
    expect(formatRunDuration(850)).toBe('850ms');
    expect(formatRunDuration(12_500)).toBe('12.5s');
    expect(formatRunDuration(200_000)).toBe('3m 20s');
    expect(formatRunDuration(3_900_000)).toBe('1h 5m');
  });

  it('carries a rounded remainder into the larger unit', () => {
    expect(formatRunDuration(999.6)).toBe('1s');
    expect(formatRunDuration(59_990)).toBe('1m');
    expect(formatRunDuration(119_500)).toBe('2m');
    expect(formatRunDuration(3_599_999)).toBe('1h');
    expect(formatRunDuration(7_170_000)).toBe('2h');
    expect(formatRunDuration(5_370_000)).toBe('1h 30m');
  });

  it('drops a zero remainder', () => {
    expect(formatRunDuration(120_000)).toBe('2m');
    expect(formatRunDuration(7_200_000)).toBe('2h');
  });
});
