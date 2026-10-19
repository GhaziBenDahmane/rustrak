/**
 * Every operation in `openapi.json`, called through the client.
 *
 * Walks the spec rather than a list, so an endpoint added to the server is
 * covered the day the client is regenerated. For each one it checks that the
 * method sends the documented HTTP method, path and required query, and that
 * a response built from the spec's own schema comes back as `success: true`:
 * what the server is held to by `openapi_contract_test.rs`, the client's
 * validators must accept.
 */
import { readFileSync } from 'node:fs';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { RustrakClient } from '../../src/client.js';
import { server } from '../setup.js';

type Schema = Record<string, unknown>;
type Operation = {
  operationId: string;
  tags: string[];
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    schema: Schema;
  }[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
};

const spec = JSON.parse(
  readFileSync(
    new URL('../../../../apps/server/openapi.json', import.meta.url),
    'utf8',
  ),
) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const BASE = 'http://rustrak.test';

/** A value that satisfies `schema`, built from the spec alone. */
function sample(schema: Schema | undefined): unknown {
  if (!schema) return {};
  if (typeof schema.$ref === 'string') {
    return sample(spec.components.schemas[schema.$ref.split('/').pop()!]);
  }
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const options = schema[key] as Schema[] | undefined;
    if (!options) continue;
    if (key === 'allOf') {
      return Object.assign({}, ...options.map((s) => sample(s)));
    }
    return sample(options.find((s) => s.type !== 'null') ?? options[0]);
  }
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const types = [schema.type].flat().filter((t) => t !== 'null');
  switch (types[0]) {
    case 'string':
      return (
        {
          uuid: '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f',
          'date-time': '2026-01-01T00:00:00Z',
          email: 'contract@example.com',
          uri: 'https://example.com',
        }[schema.format as string] ?? 'x'.repeat(Number(schema.minLength ?? 1))
      );
    case 'integer':
    case 'number':
      return Number(schema.minimum ?? 1);
    case 'boolean':
      return true;
    case 'array':
      return [sample(schema.items as Schema)];
    case 'object':
    case undefined: {
      const properties = (schema.properties ?? {}) as Record<string, Schema>;
      return Object.fromEntries(
        Object.entries(properties).map(([k, v]) => [k, sample(v)]),
      );
    }
    default:
      return null;
  }
}

/** What to call the method with, and the URL and query it must produce. */
function request(path: string, op: Operation) {
  const pathParams: Record<string, unknown> = {};
  const query: Record<string, unknown> = {};
  let url = path;
  for (const p of op.parameters ?? []) {
    const value = sample(p.schema);
    if (p.in === 'path') {
      pathParams[p.name] = value;
      url = url.replace(`{${p.name}}`, String(value));
    } else if (p.in === 'query' && p.required) {
      query[p.name] = value;
    }
  }
  const json = op.requestBody?.content['application/json'];
  const multipart = op.requestBody?.content['multipart/form-data'];
  const options = {
    ...(Object.keys(pathParams).length && { path: pathParams }),
    ...(Object.keys(query).length && { query }),
    ...(json && { body: sample(json.schema) }),
    ...(multipart && { body: {} }),
  };
  return { options, url, query };
}

const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({ path, method, op })),
);

describe('every operation in openapi.json', () => {
  const client = new RustrakClient({ baseUrl: BASE, maxRetries: 0 });

  it.each(operations)('$method $path', async ({ path, method, op }) => {
    const [resource, name] = op.operationId.split('.');
    const call = (
      client as unknown as Record<string, Record<string, Function>>
    )[resource!]?.[name!];
    expect(call, `client.${resource}.${name}`).toBeTypeOf('function');

    const { options, url, query } = request(path, op);

    // Redirects and the invite-only `register` document no 2xx: answer with
    // the first status they do document and check only the request.
    const [status, response] =
      Object.entries(op.responses).find(([s]) => s.startsWith('2')) ??
      Object.entries(op.responses)[0]!;
    const responseSchema = response.content?.['application/json']?.schema;

    let seen: Request | undefined;
    server.use(
      http.all(`${BASE}*`, ({ request }) => {
        seen = request;
        return status === '204' || status.startsWith('3') || !responseSchema
          ? new HttpResponse(null, { status: Number(status) })
          : HttpResponse.json(sample(responseSchema), {
              status: Number(status),
            });
      }),
    );

    const result = await call!(options);

    expect(result).toMatchObject({ success: status.startsWith('2') });
    expect(seen?.method).toBe(method.toUpperCase());
    const sent = new URL(seen!.url);
    expect(decodeURIComponent(sent.pathname)).toBe(url);
    for (const [k, v] of Object.entries(query)) {
      expect(sent.searchParams.get(k)).toBe(String(v));
    }
  });
});
