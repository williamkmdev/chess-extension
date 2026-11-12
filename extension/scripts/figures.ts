// Makes the README's figures from a screenshot we make ourselves: a mock video page,
// rendered in headless Chrome, with a real opening position (from chess.js) drawn with
// the extension's own cburnett pieces. The extension's vision code then runs on it:
// the board locator, the tiling and, if the model is installed in models/, the piece
// classifier. Run with `npm run figures`; set CHROME to Chrome's path if it isn't found.
//
// Writes docs/images/: screenshot.png, profiles.svg, runs.png, coverage.png, tiles.png,
// recognized.svg, and figures.json with the numbers quoted in the README.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import {
  boundaryProfiles,
  candidateRuns,
  detectGrid,
  findPeaks,
  fitGrids,
  gridBounds,
  locateBoard,
  toGray,
  type Grid,
  type GrayImage,
} from '../src/vision/locate.ts';
import { boardTiles, TILE_SIZE } from '../src/vision/tiles.ts';
import { decodePng, encodePng, type Rgba } from './png.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const OUT = here('../../docs/images/');
const PIECES = here('../src/panel/board/pieces/');
const MODELS = here('../models/');

const WIDTH = 1280;
const HEIGHT = 720;
const BOARD = { x: 194, y: 84, square: 64 };

/** The Breyer Variation of the Ruy Lopez, after 10...Nbd7. */
const MOVES = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7';

// ---------------------------------------------------------------------------------------
// The screenshot

function position() {
  const chess = new Chess();
  for (const move of MOVES.split(' ')) chess.move(move);
  const last = chess.history({ verbose: true }).at(-1);
  return { chess, last };
}

function pageHtml(): string {
  const { chess, last } = position();
  const cells: string[] = [];
  chess.board().forEach((row, r) => {
    row.forEach((piece, c) => {
      const square = `${'abcdefgh'[c] ?? ''}${String(8 - r)}`;
      const light = (r + c) % 2 === 0;
      const left = BOARD.x + c * BOARD.square;
      const top = BOARD.y + r * BOARD.square;
      const highlight = last && (square === last.from || square === last.to);
      cells.push(
        `<div style="left:${String(left)}px;top:${String(top)}px;background:${light ? '#f0d9b5' : '#b58863'}" class="sq">` +
          (highlight ? '<div class="hl"></div>' : '') +
          (c === 0
            ? `<span class="rank" style="color:${light ? '#b58863' : '#f0d9b5'}">${String(8 - r)}</span>`
            : '') +
          (r === 7
            ? `<span class="file" style="color:${light ? '#b58863' : '#f0d9b5'}">${'abcdefgh'[c] ?? ''}</span>`
            : '') +
          (piece
            ? `<img src="${pathToFileURL(join(PIECES, `${piece.color}${piece.type.toUpperCase()}.svg`)).href}">`
            : '') +
          '</div>',
      );
    });
  });
  const moves = MOVES.split(' ')
    .map((move, i) => (i % 2 === 0 ? `${String(i / 2 + 1)}. ${move}` : move))
    .join(' ');
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin:0; width:${String(WIDTH)}px; height:${String(HEIGHT)}px; overflow:hidden;
           background:#0f0f0f; color:#eee; font:15px Arial, sans-serif; }
    .video { position:absolute; left:0; top:0; width:900px; height:${String(HEIGHT)}px; background:#232323; }
    .title { position:absolute; left:24px; top:22px; font-size:20px; font-weight:bold; }
    .sq { position:absolute; width:${String(BOARD.square)}px; height:${String(BOARD.square)}px; }
    .sq img { position:absolute; inset:0; width:100%; height:100%; }
    .hl { position:absolute; inset:0; background:rgba(155,199,0,0.41); }
    .rank, .file { position:absolute; font-size:11px; font-weight:bold; }
    .rank { left:3px; top:2px; } .file { right:3px; bottom:2px; }
    .bar { position:absolute; left:24px; right:24px; top:676px; height:4px; background:#555; }
    .bar div { width:41%; height:100%; background:#e33; }
    .time { position:absolute; left:24px; top:688px; font-size:13px; color:#ccc; }
    .side { position:absolute; left:900px; top:0; width:380px; height:${String(HEIGHT)}px; padding:22px; box-sizing:border-box; }
    .side h2 { font-size:16px; margin:0 0 10px; }
    .moves { line-height:1.6; color:#ccc; margin-bottom:24px; }
    .card { display:flex; gap:12px; margin-bottom:14px; }
    .thumb { width:120px; height:68px; background:#3a3a3a; border-radius:6px; flex:none; }
    .card p { margin:0; font-size:13px; color:#bbb; }
  </style>
  <div class="video">
    <div class="title">Understanding the Breyer Variation, part 2</div>
    ${cells.join('\n')}
    <div class="bar"><div></div></div>
    <div class="time">12:41 / 31:05</div>
  </div>
  <div class="side">
    <h2>Moves</h2>
    <div class="moves">${moves}</div>
    <h2>Up next</h2>
    <div class="card"><div class="thumb"></div><p>The Marshall Attack in 20 minutes</p></div>
    <div class="card"><div class="thumb"></div><p>Endgame technique: rook and pawn</p></div>
    <div class="card"><div class="thumb"></div><p>Five plans against the Berlin</p></div>
  </div>`;
}

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

function screenshot(): Rgba {
  const dir = mkdtempSync(join(tmpdir(), 'figures-'));
  try {
    const page = join(dir, 'page.html');
    const shot = join(dir, 'shot.png');
    writeFileSync(page, pageHtml());
    const result = spawnSync(
      findChrome(),
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${join(dir, 'profile')}`,
        `--window-size=${String(WIDTH)},${String(HEIGHT)}`,
        `--screenshot=${shot}`,
        pathToFileURL(page).href,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (!existsSync(shot)) throw new Error(`Chrome made no screenshot: ${result.stderr}`);
    return decodePng(readFileSync(shot));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------
// Drawing helpers

const GREEN: readonly [number, number, number] = [0x16, 0xa3, 0x4a];
const RED: readonly [number, number, number] = [0xdc, 0x26, 0x26];

function setPixel(image: Rgba, x: number, y: number, [r, g, b]: readonly number[]) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = r ?? 0;
  image.data[i + 1] = g ?? 0;
  image.data[i + 2] = b ?? 0;
  image.data[i + 3] = 255;
}

const fmt = (value: number) => String(Math.round(value * 10) / 10);

// ---------------------------------------------------------------------------------------
// Figures

/** The screenshot with the located board outlined, as the panel shows it. */
function outlined(image: Rgba, rect: { x: number; y: number; width: number; height: number }) {
  const copy = { ...image, data: new Uint8ClampedArray(image.data) };
  for (let t = 1; t <= 3; t += 1) {
    for (let x = rect.x - t; x < rect.x + rect.width + t; x += 1) {
      setPixel(copy, x, rect.y - t, GREEN);
      setPixel(copy, x, rect.y + rect.height - 1 + t, GREEN);
    }
    for (let y = rect.y - t; y < rect.y + rect.height + t; y += 1) {
      setPixel(copy, rect.x - t, y, GREEN);
      setPixel(copy, rect.x + rect.width - 1 + t, y, GREEN);
    }
  }
  return copy;
}

interface AxisData {
  readonly profile: Float32Array;
  readonly peaks: readonly number[];
  readonly fits: number;
  readonly grid: Grid;
}

/**
 * The screenshot with its two boundary profiles beside it, on the same scale: the
 * column scores below the image and the row scores to its right, so each peak lines
 * up with the board line that produced it. Peaks, the seven-line fit that won, and the
 * board's edges are marked on both.
 */
function profilesSvg(image: Rgba, [xAxis, yAxis]: readonly [AxisData, AxisData]): string {
  const S = 0.6; // image scale
  const L = 56; // left margin (row ticks)
  const T = 34; // top margin (title)
  const GAP = 14;
  const CHART = 150; // depth of each chart
  const imgW = image.width * S;
  const imgH = image.height * S;
  const right = L + imgW + GAP; // the row chart's baseline
  const bottom = T + imgH + GAP + CHART; // the column chart's baseline
  const W = right + CHART + 24;
  const H = bottom + 64;
  // Pixel centres are at integer positions, so a boundary between pixels i and i + 1 is
  // at i + 0.5 (as the locator reports peaks).
  const X = (p: number) => L + (p + 0.5) * S;
  const Y = (p: number) => T + (p + 0.5) * S;
  const depth = (axis: AxisData) => {
    const max = Math.max(...axis.profile);
    return (score: number) => Math.sqrt(Math.max(score, 0) / max) * (CHART - 8);
  };
  const scoreAt = (axis: AxisData, position: number) => axis.profile[Math.floor(position)] ?? 0;
  const lines = (grid: Grid) => Array.from({ length: 7 }, (_, k) => grid.start + k * grid.spacing);

  const dx = depth(xAxis);
  const dy = depth(yAxis);
  const [left, rightEdge] = gridBounds(xAxis.grid);
  const [top, bottomEdge] = gridBounds(yAxis.grid);
  const v = (x: number, y1: number, y2: number, cls: string) =>
    `<line x1="${fmt(x)}" x2="${fmt(x)}" y1="${fmt(y1)}" y2="${fmt(y2)}" class="${cls}"/>`;
  const h = (y: number, x1: number, x2: number, cls: string) =>
    `<line x1="${fmt(x1)}" x2="${fmt(x2)}" y1="${fmt(y)}" y2="${fmt(y)}" class="${cls}"/>`;

  const columnChart = [
    `<rect x="${fmt(X(left))}" y="${fmt(bottom - CHART)}" width="${fmt(X(rightEdge) - X(left))}" height="${String(CHART)}" class="board"/>`,
    `<polyline points="${Array.from(xAxis.profile, (s, i) => `${fmt(X(i + 0.5))},${fmt(bottom - dx(s))}`).join(' ')}" class="profile"/>`,
    ...xAxis.peaks.map(
      (p) =>
        `<circle cx="${fmt(X(p))}" cy="${fmt(bottom - dx(scoreAt(xAxis, p)))}" r="2.5" class="peak"/>`,
    ),
    ...xAxis.grid.peaks.map(
      (p) =>
        `<circle cx="${fmt(X(p))}" cy="${fmt(bottom - dx(scoreAt(xAxis, p)))}" r="5" class="matched"/>`,
    ),
    h(bottom, L, L + imgW, 'axis'),
    ...Array.from({ length: Math.floor(image.width / 200) + 1 }, (_, k) => k * 200).map(
      (t) =>
        `<text x="${fmt(X(t))}" y="${fmt(bottom + 16)}" class="tick" text-anchor="middle">${String(t)}</text>`,
    ),
  ];
  const rowChart = [
    `<rect x="${fmt(right)}" y="${fmt(Y(top))}" width="${String(CHART)}" height="${fmt(Y(bottomEdge) - Y(top))}" class="board"/>`,
    `<polyline points="${Array.from(yAxis.profile, (s, i) => `${fmt(right + dy(s))},${fmt(Y(i + 0.5))}`).join(' ')}" class="profile"/>`,
    ...yAxis.peaks.map(
      (p) =>
        `<circle cx="${fmt(right + dy(scoreAt(yAxis, p)))}" cy="${fmt(Y(p))}" r="2.5" class="peak"/>`,
    ),
    ...yAxis.grid.peaks.map(
      (p) =>
        `<circle cx="${fmt(right + dy(scoreAt(yAxis, p)))}" cy="${fmt(Y(p))}" r="5" class="matched"/>`,
    ),
    v(right, T, T + imgH, 'axis'),
    ...Array.from({ length: Math.floor(image.height / 200) + 1 }, (_, k) => k * 200).map(
      (t) =>
        `<text x="${fmt(L - 8)}" y="${fmt(Y(t) + 4)}" class="tick" text-anchor="end">${String(t)}</text>`,
    ),
  ];
  // The winning lines and edges, drawn from the board out across its chart, so the
  // eye can follow each one from the image to its peak.
  const guides = [
    ...lines(xAxis.grid).map((x) => v(X(x), Y(top), bottom, 'fit')),
    ...lines(yAxis.grid).map((y) => h(Y(y), X(left), right + CHART, 'fit')),
    ...[left, rightEdge].map((x) => v(X(x), Y(top), bottom, 'edge')),
    ...[top, bottomEdge].map((y) => h(Y(y), X(left), right + CHART, 'edge')),
  ];
  const png = encodePng(image).toString('base64');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="${fmt(W)}" height="${fmt(H)}">
<style>
  text { font: 13px system-ui, sans-serif; fill: #1f2937; }
  .title { font-weight: 600; }
  .note, .tick { fill: #6b7280; font-size: 12px; }
  .profile { fill: none; stroke: #374151; stroke-width: 1; }
  .peak { fill: #9ca3af; }
  .matched { fill: none; stroke: #16a34a; stroke-width: 2.5; }
  .fit { stroke: #16a34a; stroke-width: 1; stroke-dasharray: 4 3; }
  .edge { stroke: #15803d; stroke-width: 2; }
  .board { fill: #16a34a; fill-opacity: 0.08; }
  .axis { stroke: #9ca3af; }
  .dim { fill: #ffffff; fill-opacity: 0.2; }
</style>
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${fmt(L)}" y="${fmt(T - 12)}" class="title">Boundary scores, aligned with the screenshot</text>
<image x="${fmt(L)}" y="${fmt(T)}" width="${fmt(imgW)}" height="${fmt(imgH)}" href="data:image/png;base64,${png}"/>
<rect x="${fmt(L)}" y="${fmt(T)}" width="${fmt(imgW)}" height="${fmt(imgH)}" class="dim"/>
${columnChart.join('\n')}
${rowChart.join('\n')}
${guides.join('\n')}
<text x="${fmt(L)}" y="${fmt(H - 26)}" class="note">Score: √(rising change × falling change), scaled to the strongest; columns below the image, rows to its right.</text>
<text x="${fmt(L)}" y="${fmt(H - 9)}" class="note">Grey dots: peaks. Green circles: the seven peaks of the winning fit. Dashed: fitted lines. Solid: board edges.</text>
</svg>
`;
}

/**
 * Every transition run in the whole screenshot, each in its own colour on black. The
 * locator only looks for runs along the lines of candidate grids; this checks every
 * boundary, with the same code, to show the skeleton the board leaves.
 */
function runsPng(gray: GrayImage): Rgba {
  const image: Rgba = {
    width: gray.width,
    height: gray.height,
    data: new Uint8ClampedArray(gray.width * gray.height * 4),
  };
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  // Seeded, so the figure is the same every run (mulberry32).
  let seed = 42;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const colour = () => [0, 0, 0].map(() => 64 + random() * 191);
  // A grid whose "peaks" are every boundary, so candidateRuns checks all of them.
  const every = (count: number): Grid => ({
    peaks: Array.from({ length: count }, (_, i) => i + 0.5),
    start: 0,
    spacing: 0,
    rmsError: 0,
    strength: 0,
  });
  for (const axis of ['x', 'y'] as const) {
    const count = (axis === 'x' ? gray.width : gray.height) - 1;
    for (const [boundary, runs] of candidateRuns(gray, [every(count)], axis)) {
      for (const [start, end] of runs) {
        const rgb = colour();
        // A run covers samples start + 0.5 … end − 0.5; drawn 2 px wide, on both
        // pixels next to the boundary.
        for (let i = Math.ceil(start); i < end; i += 1) {
          for (const d of [0, 1]) {
            if (axis === 'x') setPixel(image, boundary + d, i, rgb);
            else setPixel(image, i, boundary + d, rgb);
          }
        }
      }
    }
  }
  return image;
}

/**
 * The board area in grayscale (what the locator sees), with its 14 interior lines:
 * green where a transition run covers the line, red where none does.
 */
function coveragePng(gray: GrayImage, x: Grid, y: Grid, margin: number): Rgba {
  const [left, right] = gridBounds(x);
  const [top, bottom] = gridBounds(y);
  const x0 = Math.max(0, Math.floor(left) - margin);
  const y0 = Math.max(0, Math.floor(top) - margin);
  const x1 = Math.min(gray.width, Math.ceil(right) + margin);
  const y1 = Math.min(gray.height, Math.ceil(bottom) + margin);
  const image: Rgba = {
    width: x1 - x0,
    height: y1 - y0,
    data: new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4),
  };
  for (let row = y0; row < y1; row += 1) {
    for (let col = x0; col < x1; col += 1) {
      // Faded, so the lines stand out.
      const value = 255 - (255 - (gray.data[row * gray.width + col] ?? 0)) * 0.55;
      setPixel(image, col - x0, row - y0, [value, value, value]);
    }
  }
  const xRuns = candidateRuns(gray, [x], 'x');
  const yRuns = candidateRuns(gray, [y], 'y');
  const covered = (runs: readonly (readonly [number, number])[], i: number) =>
    runs.some(([start, end]) => i >= start && i < end);
  for (const peak of x.peaks) {
    const runs = xRuns.get(Math.floor(peak)) ?? [];
    for (let i = Math.ceil(top); i <= Math.floor(bottom); i += 1) {
      const color = covered(runs, i) ? GREEN : RED;
      for (let d = -1; d <= 2; d += 1) setPixel(image, Math.floor(peak) + d - x0, i - y0, color);
    }
  }
  for (const peak of y.peaks) {
    const runs = yRuns.get(Math.floor(peak)) ?? [];
    for (let i = Math.ceil(left); i <= Math.floor(right); i += 1) {
      const color = covered(runs, i) ? GREEN : RED;
      for (let d = -1; d <= 2; d += 1) setPixel(image, i - x0, Math.floor(peak) + d - y0, color);
    }
  }
  return image;
}

/** The 64 grayscale tiles the model sees, in screen order, with gaps between them. */
function tilesPng(tiles: Uint8Array): Rgba {
  const SCALE = 2;
  const GAP = 6;
  const cell = TILE_SIZE * SCALE;
  const size = 8 * cell + 7 * GAP;
  const image: Rgba = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  for (let tile = 0; tile < 64; tile += 1) {
    const ox = (tile % 8) * (cell + GAP);
    const oy = Math.floor(tile / 8) * (cell + GAP);
    for (let py = 0; py < cell; py += 1) {
      for (let px = 0; px < cell; px += 1) {
        const value =
          tiles[
            tile * TILE_SIZE * TILE_SIZE +
              Math.floor(py / SCALE) * TILE_SIZE +
              Math.floor(px / SCALE)
          ] ?? 0;
        setPixel(image, ox + px, oy + py, [value, value, value]);
      }
    }
  }
  return image;
}

interface Prediction {
  readonly label: string;
  readonly confidence: number;
  readonly truth: string;
}

/** The model's reading of each square, with its confidence; wrong squares in red. */
function recognizedSvg(predictions: readonly Prediction[]): string {
  const CELL = 64;
  const PAD = 24;
  const size = 8 * CELL;
  const cells = predictions.map((p, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const x = PAD + col * CELL;
    const y = PAD + row * CELL;
    const light = (row + col) % 2 === 0;
    const wrong = p.label !== p.truth;
    const text = p.label === '1' ? '·' : p.label;
    const white = p.label !== '1' && p.label === p.label.toUpperCase();
    return [
      `<rect x="${String(x)}" y="${String(y)}" width="${String(CELL)}" height="${String(CELL)}" fill="${light ? '#f0d9b5' : '#b58863'}"/>`,
      wrong
        ? `<rect x="${String(x + 2)}" y="${String(y + 2)}" width="${String(CELL - 4)}" height="${String(CELL - 4)}" fill="none" stroke="#dc2626" stroke-width="4"/>`
        : '',
      `<text x="${String(x + CELL / 2)}" y="${String(y + 36)}" text-anchor="middle" class="${white ? 'w' : 'b'}">${text}</text>`,
      `<text x="${String(x + CELL / 2)}" y="${String(y + 56)}" text-anchor="middle" class="c">${String(Math.round(p.confidence * 100))}%</text>`,
    ].join('');
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size + 2 * PAD)} ${String(size + 2 * PAD)}" width="${String(size + 2 * PAD)}" height="${String(size + 2 * PAD)}">
<style>
  text { font-family: system-ui, sans-serif; }
  .w { font-size: 26px; font-weight: 700; fill: #ffffff; stroke: #1f2937; stroke-width: 1.2px; paint-order: stroke; }
  .b { font-size: 26px; font-weight: 700; fill: #111827; }
  .c { font-size: 11px; fill: #1f2937; fill-opacity: 0.75; }
</style>
<rect width="100%" height="100%" fill="#ffffff"/>
${cells.join('\n')}
</svg>
`;
}

// ---------------------------------------------------------------------------------------

async function classify(
  tiles: Uint8Array,
): Promise<{ probs: Float32Array; labels: string } | null> {
  const model = join(MODELS, 'chess_tiles.onnx');
  const metadata = join(MODELS, 'model_metadata.json');
  if (!existsSync(model) || !existsSync(metadata)) return null;
  const { labels } = JSON.parse(readFileSync(metadata, 'utf8')) as { labels: string };
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(model)), {
    executionProviders: ['wasm'],
  });
  const input = Float32Array.from(tiles, (value) => value / 255);
  const output = await session.run({
    tiles: new ort.Tensor('float32', input, [64, 1, TILE_SIZE, TILE_SIZE]),
  });
  const probs = output.probs?.data;
  await session.release();
  if (!(probs instanceof Float32Array)) throw new Error('The model gave no probabilities.');
  return { probs, labels };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const image = screenshot();
  const gray = toGray(image);

  const started = performance.now();
  const located = locateBoard(image);
  const locateMs = performance.now() - started;
  const grid = detectGrid(gray);
  if (!located.ok || !grid.ok)
    throw new Error('The locator found no board on the figure screenshot.');

  const profiles = boundaryProfiles(gray);
  const axis = (profile: Float32Array, dimension: number, winner: Grid): AxisData => {
    const peaks = findPeaks(profile, dimension);
    return { profile, peaks: peaks.positions, fits: fitGrids(peaks).length, grid: winner };
  };
  const axes = [
    axis(profiles.x, image.width, grid.x),
    axis(profiles.y, image.height, grid.y),
  ] as const;

  writeFileSync(join(OUT, 'screenshot.png'), encodePng(outlined(image, located.rect)));
  writeFileSync(join(OUT, 'profiles.svg'), profilesSvg(image, axes));
  writeFileSync(join(OUT, 'runs.png'), encodePng(runsPng(gray)));
  writeFileSync(join(OUT, 'coverage.png'), encodePng(coveragePng(gray, grid.x, grid.y, 16)));
  const tiles = boardTiles(image, located.rect);
  writeFileSync(join(OUT, 'tiles.png'), encodePng(tilesPng(tiles)));

  const stats: Record<string, unknown> = {
    screenshot: { width: image.width, height: image.height },
    board: located.rect,
    expectedBoard: { x: BOARD.x, y: BOARD.y, width: 8 * BOARD.square, height: 8 * BOARD.square },
    coverage: grid.coverage,
    peaks: { x: axes[0].peaks.length, y: axes[1].peaks.length },
    fits: { x: axes[0].fits, y: axes[1].fits },
    locateMs: Math.round(locateMs),
  };

  const result = await classify(tiles);
  if (result) {
    const { chess } = position();
    const truth = chess
      .board()
      .flat()
      .map((piece) =>
        piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type) : '1',
      );
    const predictions: Prediction[] = truth.map((expected, tile) => {
      const row = result.probs.subarray(
        tile * result.labels.length,
        (tile + 1) * result.labels.length,
      );
      let best = 0;
      for (let k = 1; k < row.length; k += 1) if ((row[k] ?? 0) > (row[best] ?? 0)) best = k;
      return { label: result.labels[best] ?? '?', confidence: row[best] ?? 0, truth: expected };
    });
    writeFileSync(join(OUT, 'recognized.svg'), recognizedSvg(predictions));
    stats.recognition = {
      correct: predictions.filter((p) => p.label === p.truth).length,
      lowestConfidence: Math.min(...predictions.map((p) => p.confidence)),
    };
  } else {
    console.warn('No model in extension/models/, so recognized.svg is left as it was.');
  }

  writeFileSync(join(OUT, 'figures.json'), `${JSON.stringify(stats, null, 2)}\n`);
  console.log(JSON.stringify(stats, null, 2));
}

await main();
