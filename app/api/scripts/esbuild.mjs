// Bundles the Lambda entrypoints into self-contained ESM files.
//
// @aws-sdk/* is provided by the nodejs22.x managed runtime, so it is marked
// external rather than shipped — keeping the deploy zip small to reduce
// cold-start latency. Everything else (e.g. stripe) is bundled in.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [
    resolve(apiRoot, 'src/handler.ts'),
    resolve(apiRoot, 'src/image-moderation-handler.ts'),
  ],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: resolve(apiRoot, 'build/package'),
  external: ['@aws-sdk/*'],
  minify: true,
  sourcemap: true,
  // Some bundled CJS deps reference `require`; define it for the ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
});
