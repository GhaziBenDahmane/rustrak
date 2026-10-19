/**
 * Generates `src/generated/` from the server's `openapi.json`.
 *
 * The SDK is one `Rustrak` class with a property per resource. Each handler
 * names its method in Rust, `operation_id = "issues.list"`, and hey-api splits
 * that id on the dot: `client.issues.list()`. Nothing here derives a name.
 */
import { readFileSync } from 'node:fs';
import { defineConfig } from '@hey-api/openapi-ts';

const spec = readFileSync(
  new URL('../../apps/server/openapi.json', import.meta.url),
  'utf8',
);

export default defineConfig({
  // `int64` would become `bigint` in zod; every id and count here fits a JS
  // number, and the server sends them as JSON numbers.
  input: JSON.parse(spec.replaceAll(/,\s*"format": "int64"/g, '')),
  // `generate:check` writes elsewhere and diffs, so it never rewrites the
  // files a parallel build or test is reading.
  output: {
    path: process.env.RUSTRAK_CLIENT_OUT ?? './src/generated',
    importFileExtension: '.js',
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    { name: 'zod', dates: { offset: true } },
    {
      name: '@hey-api/sdk',
      validator: 'zod',
      operations: {
        strategy: 'single',
        containerName: 'Rustrak',
        methods: 'instance',
      },
    },
  ],
});
