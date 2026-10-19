import { describe, expect, it } from 'vitest';
import {
  navigableRedirect,
  resumableAuthorization,
} from './pending-authorization';

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

describe('navigableRedirect', () => {
  it('lets the browser go to a web page or an app', () => {
    for (const url of [
      'https://claude.ai/api/mcp/auth_callback?code=x',
      'http://localhost:49581/callback?code=x',
      'cursor://anysphere.cursor-mcp/oauth/callback?code=x',
    ]) {
      expect(navigableRedirect(url)).toBe(true);
    }
  });

  it('never to something that runs in this page', () => {
    for (const url of [
      'javascript:alert(document.domain)//?code=x',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'not a url',
    ]) {
      expect(navigableRedirect(url)).toBe(false);
    }
  });
});
