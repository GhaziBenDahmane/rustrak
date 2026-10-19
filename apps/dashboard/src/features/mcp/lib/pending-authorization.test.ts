import { describe, expect, it } from 'vitest';
import { resumableAuthorization } from './pending-authorization';

describe('resumableAuthorization', () => {
  it('resumes a consent page', () => {
    const path = '/oauth/authorize?client_id=https%3A%2F%2Fa.example%2Fc.json';
    expect(resumableAuthorization(path)).toBe(path);
  });

  it('follows nothing else', () => {
    for (const stored of [
      null,
      undefined,
      '',
      '/projects',
      '//evil.example/oauth/authorize?x=1',
      'https://evil.example/oauth/authorize?x=1',
      '/oauth/authorize',
    ]) {
      expect(resumableAuthorization(stored)).toBeUndefined();
    }
  });
});
