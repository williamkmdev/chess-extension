// Renders an HTML page to a PNG with headless Chrome, for the scripts that draw the
// README figures and the store images. Set CHROME to Chrome's path if it isn't found.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function findChrome(): string {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((path) => path !== undefined && existsSync(path));
  if (!found) throw new Error('Chrome not found: set CHROME to its path.');
  return found;
}

/** The PNG Chrome makes of `html` in a `width` × `height` window, at 1 px per CSS px. */
export function renderHtml(html: string, width: number, height: number): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'render-'));
  try {
    const page = join(dir, 'page.html');
    const shot = join(dir, 'shot.png');
    writeFileSync(page, html);
    const result = spawnSync(
      findChrome(),
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${join(dir, 'profile')}`,
        `--window-size=${String(width)},${String(height)}`,
        `--screenshot=${shot}`,
        pathToFileURL(page).href,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (!existsSync(shot)) throw new Error(`Chrome made no screenshot: ${result.stderr}`);
    return readFileSync(shot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
