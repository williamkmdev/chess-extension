import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Copies files into the build unchanged. The Stockfish loader finds its .wasm by
 * replacing ".js" in its own URL, so neither file may be bundled, renamed or hashed.
 */
function copyUnchanged(files: Readonly<Record<string, string>>): Plugin {
  return {
    name: 'copy-unchanged',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(fromHere(source)) });
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
      LICENSE: '../LICENSE',
    }),
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
