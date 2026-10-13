import { HttpResponse, http } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { RustrakClient } from '../../src/client.js';
import { expectErr, expectOk } from '../helpers/result.js';
import { appErrorResponse } from '../mocks/handlers.js';
import { server } from '../setup.js';

const BASE_URL = 'http://localhost:8080';
const NOW = '2026-10-13T10:00:00Z';

const repository = {
  project_id: 1,
  installation_id: 99,
  repo_full_name: 'acme/web',
  default_branch: 'main',
  html_url: 'https://github.com/acme/web',
  code_mappings: [{ stack_root: '/app/', source_root: 'src/' }],
};

const link = {
  id: 3,
  issue_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  repo_full_name: 'acme/web',
  number: 12,
  title: 'Login is broken',
  url: 'https://github.com/acme/web/issues/12',
  state: 'open',
  created_at: NOW,
};

describe('GitHubResource', () => {
  let client: RustrakClient;

  beforeEach(() => {
    client = new RustrakClient({ baseUrl: BASE_URL, token: 'test-token' });
  });

  it('reads the connection status', async () => {
    server.use(
      http.get(`${BASE_URL}/api/github`, () =>
        HttpResponse.json({
          app: {
            app_id: 7,
            slug: 'rustrak',
            html_url: 'https://github.com/apps/rustrak',
            owner_login: 'acme',
            install_url: 'https://github.com/apps/rustrak/installations/new',
            last_webhook_at: null,
            created_at: NOW,
          },
          installations: [
            {
              id: 99,
              account_login: 'acme',
              account_type: 'Organization',
              suspended: false,
              created_at: NOW,
            },
          ],
          webhook_url: 'https://rustrak.example.com/api/github/webhook',
        }),
      ),
    );
    const status = expectOk(await client.github.status());
    expect(status.app?.slug).toBe('rustrak');
    expect(status.installations[0]?.account_login).toBe('acme');
  });

  it('asks for the manifest to post to GitHub', async () => {
    server.use(
      http.post(`${BASE_URL}/api/github/manifest`, async ({ request }) => {
        expect(await request.json()).toEqual({ organization: 'acme' });
        return HttpResponse.json({
          action_url: 'https://github.com/organizations/acme/settings/apps/new',
          manifest: '{}',
        });
      }),
    );
    const manifest = expectOk(await client.github.manifest('acme'));
    expect(manifest.manifest).toBe('{}');
  });

  it('reads, sets and removes a project repository', async () => {
    server.use(
      http.get(`${BASE_URL}/api/projects/1/github`, () =>
        HttpResponse.json(null),
      ),
      http.put(`${BASE_URL}/api/projects/1/github`, () =>
        HttpResponse.json(repository),
      ),
      http.delete(
        `${BASE_URL}/api/projects/1/github`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    expect(expectOk(await client.github.projectRepository(1))).toBeNull();
    const saved = expectOk(
      await client.github.setProjectRepository(1, {
        installation_id: 99,
        repo_full_name: 'acme/web',
      }),
    );
    expect(saved.code_mappings[0]?.source_root).toBe('src/');
    expectOk(await client.github.removeProjectRepository(1));
  });

  it('reports why a project cannot list repositories', async () => {
    server.use(
      http.get(`${BASE_URL}/api/github/repositories`, () =>
        appErrorResponse(
          'ValidationError',
          'Validation error: GitHub is not connected to this Rustrak instance',
        ),
      ),
    );
    const error = expectErr(await client.github.repositories(1));
    expect(error.kind).toBe('validation');
  });

  it("reads an issue's GitHub links and links issues", async () => {
    const base = `${BASE_URL}/api/projects/1/issues/${link.issue_id}/github`;
    server.use(
      http.get(base, () =>
        HttpResponse.json({
          links: [link],
        }),
      ),
      http.post(`${base}/issues`, () =>
        HttpResponse.json(link, { status: 201 }),
      ),
      http.post(`${base}/links`, () =>
        HttpResponse.json(link, { status: 201 }),
      ),
      http.delete(
        `${base}/links/3`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const code = expectOk(await client.github.issue(1, link.issue_id));
    expect(code.links[0]?.number).toBe(12);
    expect(
      expectOk(await client.github.createIssue(1, link.issue_id)).number,
    ).toBe(12);
    expect(
      expectOk(await client.github.linkIssue(1, link.issue_id, '#12')).url,
    ).toBe(link.url);
    expectOk(await client.github.unlinkIssue(1, link.issue_id, 3));
  });

  it("sets the person's GitHub login", async () => {
    server.use(
      http.put(`${BASE_URL}/api/github/me`, async ({ request }) =>
        HttpResponse.json(await request.json()),
      ),
    );
    const me = expectOk(await client.github.setMyLogin('octocat'));
    expect(me.login).toBe('octocat');
  });
});
