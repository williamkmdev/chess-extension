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
    // Widen deliberately (e.g. activeTab for capture) alongside the feature that needs it.
    expect(manifest.permissions).toEqual(['sidePanel']);
    expect(manifest).not.toHaveProperty('host_permissions');
  });

  it('points the side panel at a source page that exists', () => {
    // The built page keeps its source-relative path, so this also keeps dist/ consistent.
    expect(exists(manifest.side_panel.default_path)).toBe(true);
  });
});
