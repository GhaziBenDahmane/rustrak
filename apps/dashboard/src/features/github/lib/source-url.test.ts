import { describe, expect, it } from 'vitest';
import { frameSourceUrl, repoPath } from './source-url';

const repo = {
  html_url: 'https://github.com/acme/web',
  default_branch: 'main',
  code_mappings: [{ stack_root: '/app/', source_root: 'src/' }],
};

describe('repoPath', () => {
  it('applies the first mapping whose stack root prefixes the path', () => {
    expect(repoPath('/app/lib/db.ts', repo.code_mappings)).toBe(
      'src/lib/db.ts',
    );
  });

  it('strips bundler schemes when no mapping applies', () => {
    expect(repoPath('webpack:///./src/a.ts', [])).toBe('src/a.ts');
    expect(repoPath('app:///main.js', [])).toBe('main.js');
    expect(repoPath('app://localhost/js/x.js', [])).toBe('js/x.js');
    expect(repoPath('/srv/app.py', [])).toBe('srv/app.py');
    expect(repoPath('', [])).toBeNull();
  });
});

describe('frameSourceUrl', () => {
  it('points at the line on the default branch', () => {
    expect(frameSourceUrl(repo, '/app/lib/db.ts', 42)).toBe(
      'https://github.com/acme/web/blob/main/src/lib/db.ts#L42',
    );
    expect(frameSourceUrl(repo, '/app/lib/db.ts')).toBe(
      'https://github.com/acme/web/blob/main/src/lib/db.ts',
    );
    expect(frameSourceUrl(repo, undefined)).toBeNull();
  });
});
