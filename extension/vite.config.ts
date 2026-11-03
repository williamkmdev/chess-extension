import { defineConfig } from 'vitest/config';

// Chrome loads the extension straight from dist/. public/manifest.json is copied
// as-is, so the paths it references must match the output names configured here.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
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
