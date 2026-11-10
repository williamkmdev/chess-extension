import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Copies files into the build unchanged. The Stockfish loader finds its .wasm by
 * replacing ".js" in its own URL, so neither file may be bundled, renamed or hashed.
 * (ONNX Runtime's .wasm needs no copy: its bundle references it with
 * `new URL(..., import.meta.url)`, which Vite emits as an asset.) With `optional`,
 * files that don't exist are skipped instead of failing the build.
 */
function copyUnchanged(
  files: Readonly<Record<string, string>>,
  { optional = false }: { optional?: boolean } = {},
): Plugin {
  return {
    name: optional ? 'copy-unchanged-optional' : 'copy-unchanged',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) {
        const path = fromHere(source);
        if (optional && !existsSync(path)) {
          this.warn(`${source} not found, so ${fileName} is left out of the build.`);
          continue;
        }
        this.emitFile({ type: 'asset', fileName, source: readFileSync(path) });
      }
    },
  };
}

// Chrome loads the extension straight from dist/. public/manifest.json is copied
// as-is, so the paths it references must match the output names configured here.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  plugins: [
    copyUnchanged({
      'engine/stockfish-19-lite-single.js':
        './node_modules/stockfish/bin/stockfish-19-lite-single.js',
      'engine/stockfish-19-lite-single.wasm':
        './node_modules/stockfish/bin/stockfish-19-lite-single.wasm',
      'engine/COPYING.txt': './node_modules/stockfish/Copying.txt',
      'licenses/onnxruntime-web.txt': './licenses/onnxruntime-web.txt',
      LICENSE: '../LICENSE',
    }),
    // The piece model isn't in the repository (see docs/vision/recognition.md). Without
    // it the extension still works; it says piece recognition isn't installed.
    copyUnchanged({ 'models/chess_tiles.onnx': './models/chess_tiles.onnx' }, { optional: true }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rolldownOptions: {
      input: {
        sidepanel: 'src/panel/sidepanel.html',
        background: 'src/background/index.ts',
      },
      output: {
        // The service worker path is fixed in the manifest, so it can't be hashed.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
