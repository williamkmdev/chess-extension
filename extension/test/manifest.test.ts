import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';

const extensionRoot = fileURLToPath(new URL('..', import.meta.url));
const exists = (relativePath: string) => existsSync(`${extensionRoot}/${relativePath}`);

describe('manifest', () => {
  it('is Manifest V3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  });

  it('requests only the permissions the current features need', () => {
    // activeTab: the screenshot is of the tab the user opened the panel on, and only
    // while they're on it; no access to any site otherwise. Widen only deliberately.
    expect(manifest.permissions).toEqual(['sidePanel', 'activeTab']);
    expect(manifest).not.toHaveProperty('host_permissions');
  });

  it('allows WebAssembly for the bundled engine and nothing more', () => {
    // MV3's default policy disables WebAssembly; this is Chrome's minimum policy plus
    // 'wasm-unsafe-eval', which the Stockfish worker needs. No remote or eval'd scripts.
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    });
  });

  it('points the side panel at a source page that exists', () => {
    // The built page keeps its source-relative path, so this also keeps dist/ consistent.
    expect(exists(manifest.side_panel.default_path)).toBe(true);
  });
});
