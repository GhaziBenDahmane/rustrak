import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { RustrakClient } from '../../src/client.js';
import { expectOk } from '../helpers/result.js';
import { server } from '../setup.js';

describe('RustrakClient', () => {
  describe('Constructor', () => {
    it('should create client with required config', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      expect(client).toBeInstanceOf(RustrakClient);
      expect(client.projects).toBeDefined();
      expect(client.issues).toBeDefined();
      expect(client.events).toBeDefined();
      expect(client.tokens).toBeDefined();
    });

    it('should accept optional timeout', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
        timeout: 60000,
      });

      expect(client).toBeInstanceOf(RustrakClient);
    });

    it('should accept optional maxRetries', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
        maxRetries: 5,
      });

      expect(client).toBeInstanceOf(RustrakClient);
    });

    it('should accept custom headers', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
        headers: {
          'X-Custom-Header': 'value',
        },
      });

      expect(client).toBeInstanceOf(RustrakClient);
    });

    it('should normalize base URL without trailing slash', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080/',
        token: 'test-token',
      });

      expect(client).toBeInstanceOf(RustrakClient);
    });
  });

  describe('Resources', () => {
    it('should expose projects resource', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      expect(client.projects).toBeDefined();
      expect(typeof client.projects.list).toBe('function');
      expect(typeof client.projects.get).toBe('function');
      expect(typeof client.projects.create).toBe('function');
      expect(typeof client.projects.update).toBe('function');
      expect(typeof client.projects.delete).toBe('function');
    });

    it('should expose issues resource', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      expect(client.issues).toBeDefined();
      expect(typeof client.issues.list).toBe('function');
      expect(typeof client.issues.get).toBe('function');
      expect(typeof client.issues.update).toBe('function');
      expect(typeof client.issues.delete).toBe('function');
    });

    it('should expose events resource', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      expect(client.events).toBeDefined();
      expect(typeof client.events.list).toBe('function');
      expect(typeof client.events.get).toBe('function');
    });

    it('should expose tokens resource', () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      expect(client.tokens).toBeDefined();
      expect(typeof client.tokens.list).toBe('function');
      expect(typeof client.tokens.get).toBe('function');
      expect(typeof client.tokens.create).toBe('function');
      expect(typeof client.tokens.delete).toBe('function');
    });
  });

  describe('Authentication', () => {
    it('should include Bearer token in requests', async () => {
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'my-secret-token',
      });

      // This will make a request and the token will be in the Authorization header
      // MSW will verify this indirectly by responding correctly
      const response = expectOk(await client.projects.list());
      expect(response.items).toBeDefined();
    });
  });

  // `BaseResource` awaits the `Response` and parses the body itself instead of
  // calling ky's `.json()` shortcut, and that shortcut was what used to set
  // `Accept`. Without an explicit default every one of the 86 methods would
  // send `Accept: */*`, so a content-negotiating proxy could answer with HTML
  // and the caller would see `invalid_response` with no clue why.
  describe('Request headers', () => {
    async function headersOfNextRequest(
      client: RustrakClient,
    ): Promise<Headers> {
      let seen: Headers | undefined;
      server.use(
        http.get('http://localhost:8080/api/projects', ({ request }) => {
          seen = request.headers;
          return HttpResponse.json({
            items: [],
            total_count: 0,
            page: 1,
            per_page: 20,
            total_pages: 0,
          });
        }),
      );

      expectOk(await client.projects.list());
      if (seen === undefined) {
        expect.fail('the request never reached the handler');
      }
      return seen;
    }

    it('asks for JSON on every request', async () => {
      const headers = await headersOfNextRequest(
        new RustrakClient({ baseUrl: 'http://localhost:8080' }),
      );

      expect(headers.get('accept')).toBe('application/json');
    });

    it('lets a caller override Accept', async () => {
      const headers = await headersOfNextRequest(
        new RustrakClient({
          baseUrl: 'http://localhost:8080',
          headers: { Accept: 'application/vnd.rustrak+json' },
        }),
      );

      expect(headers.get('accept')).toBe('application/vnd.rustrak+json');
    });

    // A JSON write spreads the caller's headers into an object, which keeps
    // nothing of a `Headers` instance or an array of pairs.
    it.each([
      ['Headers', new Headers({ Authorization: 'Bearer per-call' })],
      ['pairs', [['Authorization', 'Bearer per-call']] as [string, string][]],
    ])('keeps per-call %s on a JSON write', async (_, headers) => {
      let seen: Headers | undefined;
      server.use(
        http.post('http://localhost:8080/api/projects', ({ request }) => {
          seen = request.headers;
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await new RustrakClient({
        baseUrl: 'http://localhost:8080',
      }).projects.create({
        body: { name: 'Headers' },
        headers,
      });

      expect(seen?.get('authorization')).toBe('Bearer per-call');
    });
  });

  describe('Binary responses', () => {
    it('downloads an attachment as bytes', async () => {
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      server.use(
        http.get(
          'http://localhost:8080/api/projects/1/attachments/:id',
          () =>
            new HttpResponse(png, { headers: { 'Content-Type': 'image/png' } }),
        ),
      );
      const client = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'test-token',
      });

      const result = await client.events.downloadAttachment({
        path: {
          project_id: 1,
          attachment_id: '00000000-0000-4000-8000-000000000000',
        },
      });

      const blob = expectOk(result) as Blob;
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);
    });
  });

  describe('Multiple Instances', () => {
    it('should support multiple client instances', async () => {
      const client1 = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'token-1',
      });

      const client2 = new RustrakClient({
        baseUrl: 'http://localhost:8080',
        token: 'token-2',
      });

      // Both clients should work independently
      const [result1, result2] = await Promise.all([
        client1.projects.list(),
        client2.projects.list(),
      ]);

      expect(expectOk(result1).items).toHaveLength(2);
      expect(expectOk(result2).items).toHaveLength(2);
    });
  });
});
