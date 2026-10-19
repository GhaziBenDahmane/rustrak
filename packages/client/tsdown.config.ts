import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // One file per module, so a bundler can drop the ones a consumer never
  // imports (the SDK and its zod schemas, for one that only wants
  // `isRetryable`). `package.json` declares `sideEffects: false` for it.
  unbundle: true,
  dts: true,
  sourcemap: true,
  // Writes `main`, `module`, `types` and `exports` in package.json from the
  // build, so they cannot point at files the build no longer emits.
  exports: true,
});
