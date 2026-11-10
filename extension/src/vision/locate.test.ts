import { describe, expect, it } from 'vitest';
import {
  findPeaks,
  findRuns,
  fitGrids,
  locateBoard,
  roundHalfEven,
  toGray,
  type BoardRect,
  type RgbaImage,
} from './locate';

type Rgb = readonly [number, number, number];

/** A tiny seeded random generator, so every run draws the same pictures. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A drawn test image: all fixtures are synthetic, never real screenshots. */
class Canvas implements RgbaImage {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
    background: Rgb,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
    this.fill(0, 0, width, height, background);
  }

  fill(x: number, y: number, w: number, h: number, [r, g, b]: Rgb, alpha = 1) {
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let yy = Math.max(0, Math.round(y)); yy < y1; yy += 1) {
      for (let xx = Math.max(0, Math.round(x)); xx < x1; xx += 1) {
        const i = (yy * this.width + xx) * 4;
        this.data[i] = (this.data[i] ?? 0) * (1 - alpha) + r * alpha;
        this.data[i + 1] = (this.data[i + 1] ?? 0) * (1 - alpha) + g * alpha;
        this.data[i + 2] = (this.data[i + 2] ?? 0) * (1 - alpha) + b * alpha;
        this.data[i + 3] = 255;
      }
    }
  }

  circle(cx: number, cy: number, radius: number, color: Rgb) {
    for (let y = Math.round(cy - radius); y <= cy + radius; y += 1) {
      const half = Math.sqrt(Math.max(0, radius * radius - (y - cy) ** 2));
      this.fill(cx - half, y, half * 2, 1, color);
    }
  }

  noise(amount: number, rand: () => number) {
    for (let i = 0; i < this.data.length; i += 4) {
      const n = (rand() - 0.5) * 2 * amount;
      for (let c = 0; c < 3; c += 1) this.data[i + c] = (this.data[i + c] ?? 0) + n;
    }
  }
}

interface BoardStyle {
  readonly light: Rgb;
  readonly dark: Rgb;
  /** Draw some pieces (discs) and a last-move highlight. */
  readonly busy?: boolean;
  /** Squares per side (8 for a chessboard). */
  readonly cells?: number;
}

const BROWN: BoardStyle = { light: [240, 217, 181], dark: [181, 136, 99] };
const GREEN: BoardStyle = { light: [238, 238, 210], dark: [118, 150, 86] };
const BLUE: BoardStyle = { light: [222, 227, 230], dark: [140, 162, 173] };

function drawBoard(canvas: Canvas, rect: BoardRect, style: BoardStyle, rand: () => number) {
  const cells = style.cells ?? 8;
  const cell = rect.width / cells;
  for (let r = 0; r < cells; r += 1) {
    for (let f = 0; f < cells; f += 1) {
      const x0 = rect.x + Math.round(f * cell);
      const y0 = rect.y + Math.round(r * cell);
      const x1 = rect.x + Math.round((f + 1) * cell);
      const y1 = rect.y + Math.round((r + 1) * cell);
      canvas.fill(x0, y0, x1 - x0, y1 - y0, (f + r) % 2 === 0 ? style.light : style.dark);
    }
  }
  if (!style.busy) return;
  // Last-move highlight on two squares.
  canvas.fill(rect.x + 4 * cell, rect.y + 6 * cell, cell, cell, [205, 210, 106], 0.5);
  canvas.fill(rect.x + 4 * cell, rect.y + 4 * cell, cell, cell, [205, 210, 106], 0.5);
  // Pieces on the first two and last two ranks, and a few in the middle.
  for (let f = 0; f < 8; f += 1) {
    for (const r of [0, 1, 6, 7]) {
      const color: Rgb = r < 2 ? [30, 30, 30] : [250, 250, 250];
      canvas.circle(rect.x + (f + 0.5) * cell, rect.y + (r + 0.5) * cell, cell * 0.32, color);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const f = Math.floor(rand() * 8);
    const r = 2 + Math.floor(rand() * 4);
    canvas.circle(rect.x + (f + 0.5) * cell, rect.y + (r + 0.5) * cell, cell * 0.3, [40, 40, 40]);
  }
}

/** Clutter around the board: text-like strokes and coloured blocks. */
function drawPage(canvas: Canvas, avoid: BoardRect, rand: () => number) {
  for (let i = 0; i < 120; i += 1) {
    const w = 4 + rand() * 60;
    const h = 3 + rand() * 10;
    const x = rand() * (canvas.width - w);
    const y = rand() * (canvas.height - h);
    const inside =
      x + w > avoid.x - 4 &&
      x < avoid.x + avoid.width + 4 &&
      y + h > avoid.y - 4 &&
      y < avoid.y + avoid.height + 4;
    if (inside) continue;
    const shade = Math.round(rand() * 255);
    canvas.fill(x, y, w, h, [shade, shade, Math.round(rand() * 255)]);
  }
}

function expectFound(image: RgbaImage, board: BoardRect, tolerance = 1) {
  const result = locateBoard(image);
  if (!result.ok) throw new Error(`Not found: ${result.reason} ${String(result.coverage)}`);
  expect(Math.abs(result.rect.x - board.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.rect.y - board.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.rect.width - board.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.rect.height - board.height)).toBeLessThanOrEqual(tolerance);
  return result;
}

describe('locateBoard', () => {
  it('finds a plain board exactly, in pixel-edge coordinates', () => {
    const canvas = new Canvas(600, 600, [50, 50, 50]);
    const board = { x: 60, y: 40, width: 480, height: 480 };
    drawBoard(canvas, board, BROWN, random(1));
    const result = locateBoard(canvas);
    expect(result).toEqual({ ok: true, rect: board, coverage: expect.any(Number) as number });
    if (result.ok) expect(result.coverage).toBeGreaterThanOrEqual(0.8);
  });

  it.each([
    ['brown', BROWN],
    ['green', GREEN],
    ['blue', BLUE],
  ] as const)('finds a %s board with pieces and highlights in a busy page', (_name, theme) => {
    const rand = random(7);
    const canvas = new Canvas(1280, 720, [24, 24, 28]);
    const board = { x: 300, y: 100, width: 520, height: 520 };
    drawPage(canvas, board, rand);
    drawBoard(canvas, board, { ...theme, busy: true }, rand);
    expectFound(canvas, board);
  });

  it('finds a board in a full-HD page', () => {
    const rand = random(3);
    const canvas = new Canvas(1920, 1080, [240, 240, 240]);
    const board = { x: 1101, y: 223, width: 640, height: 640 };
    drawPage(canvas, board, rand);
    drawBoard(canvas, board, { ...GREEN, busy: true }, rand);
    expectFound(canvas, board);
  });

  it('copes with mild noise (like video compression)', () => {
    const rand = random(11);
    const canvas = new Canvas(1000, 700, [30, 30, 30]);
    const board = { x: 250, y: 80, width: 520, height: 520 };
    drawBoard(canvas, board, { ...BROWN, busy: true }, rand);
    canvas.noise(6, rand);
    expectFound(canvas, board, 2);
  });

  it('clamps a board that runs off the image edge to the image', () => {
    const canvas = new Canvas(500, 500, [40, 40, 40]);
    // The board starts 20 px left of the image; its interior lines are all visible.
    drawBoard(canvas, { x: -20, y: 10, width: 480, height: 480 }, BROWN, random(4));
    const result = locateBoard(canvas);
    expect(result.ok && result.rect).toEqual({ x: 0, y: 10, width: 460, height: 480 });
  });

  it('reports no-grid for a page without a board', () => {
    const canvas = new Canvas(1280, 720, [250, 250, 250]);
    drawPage(canvas, { x: -100, y: -100, width: 0, height: 0 }, random(5));
    expect(locateBoard(canvas)).toEqual({ ok: false, reason: 'no-grid' });
  });

  it('reports low-coverage for a grid without strong transitions', () => {
    // Squares differ by less than the smallest transition (20 grey levels): the lines
    // are found, but no run supports them.
    const canvas = new Canvas(600, 600, [128, 128, 128]);
    drawBoard(
      canvas,
      { x: 60, y: 60, width: 480, height: 480 },
      {
        light: [140, 140, 140],
        dark: [125, 125, 125],
      },
      random(6),
    );
    const result = locateBoard(canvas);
    expect(result).toMatchObject({ ok: false, reason: 'low-coverage' });
    expect(!result.ok && result.coverage).toBeLessThan(0.8);
  });

  it('does not take a 7×7 checkerboard for a chessboard', () => {
    const canvas = new Canvas(600, 600, [40, 40, 40]);
    drawBoard(canvas, { x: 55, y: 55, width: 490, height: 490 }, { ...BROWN, cells: 7 }, random(8));
    expect(locateBoard(canvas).ok).toBe(false);
  });
});

describe('roundHalfEven', () => {
  it('rounds like Python: halves to the even neighbour', () => {
    expect([0.5, 1.5, 2.5, 3.5, 2.4, 2.6, 3].map(roundHalfEven)).toEqual([0, 2, 2, 4, 2, 3, 3]);
  });
});

describe('toGray', () => {
  it('matches Pillow’s fixed-point luma', () => {
    const image = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255, 10, 200, 30, 255]),
    };
    // (R·19595 + G·38470 + B·7471 + 0x8000) >> 16
    expect([...toGray(image).data]).toEqual([255, 76, 124]);
  });
});

describe('findPeaks', () => {
  it('keeps positive local maxima, all of an equal pair, at boundary coordinates', () => {
    // dimension 200 → radius 1.
    const profile = new Float32Array([0, 5, 1, 0, 7, 7, 0, 2, 0]);
    expect(findPeaks(profile, 200)).toEqual({
      positions: [1.5, 4.5, 5.5, 7.5],
      scores: [5, 7, 7, 2],
    });
  });

  it('suppresses a weaker peak within the radius', () => {
    // dimension 600 → radius 3: the 4 at index 2 is within 3 of the 9 at index 5.
    const profile = new Float32Array([0, 0, 4, 0, 0, 9, 0, 0, 0, 0]);
    expect(findPeaks(profile, 600).positions).toEqual([5.5]);
  });
});

describe('fitGrids', () => {
  const peaks = (positions: number[]) => ({ positions, scores: positions.map(() => 1) });

  it('fits seven evenly spaced peaks', () => {
    const grids = fitGrids(peaks([100.5, 160.5, 220.5, 280.5, 340.5, 400.5, 460.5]));
    expect(grids).toHaveLength(1);
    expect(grids[0]).toMatchObject({ start: 100.5, spacing: 60, strength: 0 });
  });

  it('ignores a stray peak between the lines', () => {
    const grids = fitGrids(peaks([100.5, 160.5, 190.5, 220.5, 280.5, 340.5, 400.5, 460.5]));
    expect(grids.map((grid) => grid.peaks)).toEqual([
      [100.5, 160.5, 220.5, 280.5, 340.5, 400.5, 460.5],
    ]);
  });

  it('rejects a line more than 2 px from the fit', () => {
    expect(fitGrids(peaks([100.5, 160.5, 220.5, 283.5, 340.5, 400.5, 460.5]))).toEqual([]);
  });

  it('needs seven peaks', () => {
    expect(fitGrids(peaks([100.5, 160.5, 220.5, 280.5, 340.5, 400.5]))).toEqual([]);
  });
});

describe('findRuns', () => {
  it('finds a run of same-sign changes as a half-open span', () => {
    const changes = new Float32Array([0, 40, 42, 38, 41, 0]);
    expect(findRuns(changes, 3)).toEqual([[0.5, 4.5]]);
  });

  it('breaks a run where the sign changes', () => {
    const changes = new Float32Array([40, 40, 40, -40, -40, -40]);
    expect(findRuns(changes, 3)).toEqual([
      [-0.5, 2.5],
      [2.5, 5.5],
    ]);
  });

  it('breaks a run where the change jumps beyond 1.8× its mean', () => {
    const changes = new Float32Array([30, 30, 30, 90, 90, 90]);
    expect(findRuns(changes, 3)).toEqual([
      [-0.5, 2.5],
      [2.5, 5.5],
    ]);
  });

  it('ignores weak changes and runs shorter than the minimum', () => {
    expect(findRuns(new Float32Array([19, 19, 19, 19]), 2)).toEqual([]);
    expect(findRuns(new Float32Array([0, 50, 50, 0]), 3)).toEqual([]);
  });
});
