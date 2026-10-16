import { describe, expect, it } from 'vitest';
import { unreachableFromGitHub } from './webhook-url';

describe('unreachableFromGitHub', () => {
  it('flags loopback and private addresses', () => {
    for (const host of [
      'localhost:8090',
      '127.0.0.1',
      '10.0.0.4',
      '192.168.1.20',
      '172.16.0.1',
      '172.31.255.1',
      'rustrak.local',
      '[::1]',
    ]) {
      expect(unreachableFromGitHub(`http://${host}/api/github/webhook`)).toBe(
        true,
      );
    }
  });

  it('trusts public hosts', () => {
    expect(
      unreachableFromGitHub('https://errors.acme.com/api/github/webhook'),
    ).toBe(false);
    expect(unreachableFromGitHub('http://172.32.0.1/api/github/webhook')).toBe(
      false,
    );
  });
});
