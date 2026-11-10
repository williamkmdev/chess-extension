// Finds an axis-aligned 8×8 chessboard in an image. A step-for-step port of the
// prototype `check_all.py` (see docs/vision/locator.md): it finds seven evenly spaced
// interior lines on each axis, then accepts the pair of line sets whose 14 interior
// lines are best covered by consistent light/dark transition runs.
//
// Pure: no DOM or Chrome APIs. Arithmetic that the prototype does in float32 (NumPy) is
// rounded with Math.fround so ties and thresholds behave the same.
//
// Coordinates: internally, as in the prototype, a pixel's centre is at its index, so
// the boundary between pixels i and i+1 is at i + 0.5. The rect returned by
// locateBoard is in pixel-edge coordinates (pixel i spans [i, i+1]), like the crop.

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** RGBA bytes, row by row (as in ImageData). */
  readonly data: Uint8ClampedArray;
}

export interface BoardRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The prototype's settings, by its names. */
export const LOCATE_SETTINGS = {
  /** Seven interior boundaries for eight squares. */
  INTERIOR_LINES: 7,
  /** Every fitted line must lie this close (px) to its measured peak. */
  POSITION_TOLERANCE: 2,
  /** Largest relative difference between cell width and height. */
  SPACING_TOLERANCE: 0.1,
  /** Smallest share of the interior lines supported by transition runs. */
  STRICT_MIN_COVERAGE: 0.8,
  /** Peak neighbourhood radius, as a share of the axis length. */
  PEAK_RADIUS: 0.005,
  /** Run sample offset across a boundary, as a share of the axis length. */
  RUN_OFFSET: 0.003,
  /** Smallest grayscale change that counts as a transition. */
  MIN_CHANGE: 20,
  /** Run samples must stay within this factor of the run's mean change. */
  RUN_RATIO: 1.8,
  /** Shortest run, as a share of the image's smaller side. */
  MIN_RUN: 0.01,
} as const;

const S = LOCATE_SETTINGS;
const LINES = S.INTERIOR_LINES;
const F32_RATIO = Math.fround(S.RUN_RATIO);

/** Python's round(): halves go to the even neighbour. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export interface GrayImage {
  readonly width: number;
  readonly height: number;
  /** One value per pixel, row by row. */
  readonly data: Float32Array;
}

/** Grayscale exactly as Pillow's convert("L"): ITU-R 601-2 luma in fixed point. */
export function toGray(image: RgbaImage): GrayImage {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    gray[p] =
      ((data[i] ?? 0) * 19595 + (data[i + 1] ?? 0) * 38470 + (data[i + 2] ?? 0) * 7471 + 0x8000) >>
      16;
  }
  return { width, height, data: gray };
}

/**
 * One score per boundary on each axis: (sum of rising changes) × (sum of falling
 * changes) across it. A checkerboard boundary has both directions. `x` has one score
 * per vertical boundary (width − 1), `y` one per horizontal boundary (height − 1).
 */
export function boundaryProfiles(gray: GrayImage): { x: Float32Array; y: Float32Array } {
  const { width, height, data } = gray;
  const xPos = new Float64Array(Math.max(0, width - 1));
  const xNeg = new Float64Array(xPos.length);
  const yPos = new Float64Array(Math.max(0, height - 1));
  const yNeg = new Float64Array(yPos.length);
  for (let row = 0; row < height; row += 1) {
    const base = row * width;
    let rowPos = 0;
    let rowNeg = 0;
    for (let col = 0; col < width; col += 1) {
      const value = data[base + col] ?? 0;
      if (col + 1 < width) {
        const change = (data[base + col + 1] ?? 0) - value;
        if (change > 0) xPos[col] = (xPos[col] ?? 0) + change;
        else xNeg[col] = (xNeg[col] ?? 0) - change;
      }
      if (row + 1 < height) {
        const change = (data[base + width + col] ?? 0) - value;
        if (change > 0) rowPos += change;
        else rowNeg -= change;
      }
    }
    if (row + 1 < height) {
      yPos[row] = rowPos;
      yNeg[row] = rowNeg;
    }
  }
  // The sums are whole numbers well below 2^24, so exact in float32 too; the product is
  // rounded to float32 like the prototype's.
  const product = (pos: Float64Array, neg: Float64Array) =>
    Float32Array.from(pos, (value, i) => value * (neg[i] ?? 0));
  return { x: product(xPos, xNeg), y: product(yPos, yNeg) };
}

export interface Peaks {
  /** Boundary coordinates (index + 0.5), increasing. */
  readonly positions: number[];
  readonly scores: number[];
}

/** Positive local maxima within ±radius; equal maxima all survive. */
export function findPeaks(profile: Float32Array, dimension: number): Peaks {
  const radius = Math.max(1, roundHalfEven(S.PEAK_RADIUS * dimension));
  const positions: number[] = [];
  const scores: number[] = [];
  for (let i = 0; i < profile.length; i += 1) {
    const score = profile[i] ?? 0;
    if (score <= 0) continue;
    let max = -Infinity;
    const end = Math.min(profile.length, i + radius + 1);
    for (let j = Math.max(0, i - radius); j < end; j += 1) max = Math.max(max, profile[j] ?? 0);
    if (score === max) {
      positions.push(i + 0.5);
      scores.push(score);
    }
  }
  return { positions, scores };
}

/** Seven evenly spaced interior lines fitted to measured peaks on one axis. */
export interface Grid {
  /** The seven measured peak positions. */
  readonly peaks: readonly number[];
  /** Fitted position of the first interior line. */
  readonly start: number;
  /** Fitted distance between lines (one cell). */
  readonly spacing: number;
  readonly rmsError: number;
  /** Mean log of the peaks' scores relative to the axis's strongest peak (≤ 0). */
  readonly strength: number;
}

/** The board's outer edges along this axis (pixel-centre coordinates). */
export function gridBounds(grid: Grid): [number, number] {
  return [grid.start - grid.spacing, grid.start + LINES * grid.spacing];
}

/** First index whose position is ≥ value (NumPy searchsorted, side "left"). */
function searchSorted(positions: readonly number[], value: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((positions[mid] ?? 0) < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Every pair of peaks tried as the first and seventh interior lines. */
export function fitGrids({ positions, scores }: Peaks): Grid[] {
  const grids: Grid[] = [];
  const count = positions.length;
  if (count < LINES) return grids;
  const top = Math.log(Math.max(...scores));
  const logScores = scores.map((score) => Math.log(score) - top);
  const last = LINES - 1;
  const at = (index: number) => positions[index] ?? 0;

  for (let first = 0; first < count - LINES + 1; first += 1) {
    for (let end = first + last; end < count; end += 1) {
      const guess = (at(end) - at(first)) / last;
      if (guess <= 2 * S.POSITION_TOLERANCE) continue;
      const indices: number[] = [];
      const expected: number[] = [];
      for (let k = 0; k < LINES; k += 1) {
        const want = at(first) + k * guess;
        const right = Math.min(Math.max(searchSorted(positions, want), 0), count - 1);
        const left = Math.max(right - 1, 0);
        expected.push(want);
        indices.push(Math.abs(at(left) - want) < Math.abs(at(right) - want) ? left : right);
      }
      indices[0] = first;
      indices[last] = end;
      let valid = true;
      for (let k = 0; k < LINES; k += 1) {
        const index = indices[k] ?? 0;
        if (k > 0 && index <= (indices[k - 1] ?? 0)) valid = false;
        if (Math.abs(at(index) - (expected[k] ?? 0)) > 2 * S.POSITION_TOLERANCE) valid = false;
      }
      if (!valid) continue;

      // Least-squares line through (k, matched[k]), as np.polyfit(steps, matched, 1).
      const matched = indices.map(at);
      const meanK = last / 2;
      const meanM = matched.reduce((sum, value) => sum + value, 0) / LINES;
      let sxy = 0;
      let sxx = 0;
      matched.forEach((value, k) => {
        sxy += (k - meanK) * (value - meanM);
        sxx += (k - meanK) ** 2;
      });
      const spacing = sxy / sxx;
      const start = meanM - spacing * meanK;
      const errors = matched.map((value, k) => value - (start + k * spacing));
      if (Math.max(...errors.map(Math.abs)) > S.POSITION_TOLERANCE) continue;
      grids.push({
        peaks: matched,
        start,
        spacing,
        rmsError: Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / LINES),
        strength: indices.reduce((sum, index) => sum + (logScores[index] ?? 0), 0) / LINES,
      });
    }
  }
  return grids;
}

/** A transition run along a boundary: [start, end) in pixel-centre coordinates. */
export type Run = readonly [number, number];

/**
 * Contiguous same-sign changes of at least MIN_CHANGE whose magnitudes stay within
 * RUN_RATIO of the run's running mean, at least `minLength` long. No gaps.
 */
export function findRuns(changes: Float32Array, minLength: number): Run[] {
  const runs: Run[] = [];
  const strength = (i: number) => Math.abs(changes[i] ?? 0);
  const strong = (i: number) => strength(i) >= S.MIN_CHANGE;
  let start = 0;
  while (start < changes.length) {
    if (!strong(start)) {
      start += 1;
      continue;
    }
    const positive = (changes[start] ?? 0) > 0;
    let reference = strength(start);
    let end = start + 1;
    while (end < changes.length) {
      const value = strength(end);
      if (
        !strong(end) ||
        (changes[end] ?? 0) > 0 !== positive ||
        !(
          Math.fround(reference / F32_RATIO) <= value && value <= Math.fround(reference * F32_RATIO)
        )
      ) {
        break;
      }
      // float32, as NumPy keeps it.
      reference = Math.fround(
        reference + Math.fround(Math.fround(value - reference) / (end - start + 1)),
      );
      end += 1;
    }
    if (end - start >= minLength) runs.push([start - 0.5, end - 0.5]);
    start = end;
  }
  return runs;
}

/** Runs along every boundary used by a grid, keyed by the boundary's index. */
export function candidateRuns(
  gray: GrayImage,
  grids: readonly Grid[],
  axis: 'x' | 'y',
): Map<number, Run[]> {
  const { width, height, data } = gray;
  // Vertical boundaries (x) are columns of length `height`; horizontal ones are rows.
  const dimension = axis === 'x' ? width : height;
  const length = axis === 'x' ? height : width;
  const offset = Math.max(1, roundHalfEven(S.RUN_OFFSET * dimension));
  const minLength = Math.ceil(S.MIN_RUN * Math.min(width, height));
  const sample = (line: number, i: number) =>
    axis === 'x' ? (data[i * width + line] ?? 0) : (data[line * width + i] ?? 0);

  const boundaries = new Set(grids.flatMap((grid) => grid.peaks.map(Math.floor)));
  const runs = new Map<number, Run[]>();
  for (const index of [...boundaries].sort((a, b) => a - b)) {
    const before = index - offset + 1;
    const after = index + offset;
    if (before < 0 || after >= dimension) {
      runs.set(index, []);
      continue;
    }
    const changes = new Float32Array(length);
    for (let i = 0; i < length; i += 1) changes[i] = sample(after, i) - sample(before, i);
    runs.set(index, findRuns(changes, minLength));
  }
  return runs;
}

function coveredLength(
  peaks: readonly number[],
  runs: Map<number, Run[]>,
  lower: number,
  upper: number,
): number {
  let total = 0;
  for (const peak of peaks) {
    for (const [start, end] of runs.get(Math.floor(peak)) ?? []) {
      total += Math.max(0, Math.min(end, upper) - Math.max(start, lower));
    }
  }
  return total;
}

/** The best-supported pair of grids, or why there is none. Pixel-centre coordinates. */
export type GridResult =
  | { readonly ok: true; readonly x: Grid; readonly y: Grid; readonly coverage: number }
  | {
      readonly ok: false;
      /** no-grid: no compatible pair of grids; low-coverage: the best pair is too weak. */
      readonly reason: 'no-grid' | 'low-coverage';
      readonly coverage?: number;
    };

/** Pairs each vertical grid with each horizontal one and keeps the best supported. */
export function detectGrid(gray: GrayImage): GridResult {
  const profiles = boundaryProfiles(gray);
  const xGrids = fitGrids(findPeaks(profiles.x, gray.width));
  const yGrids = fitGrids(findPeaks(profiles.y, gray.height));
  const xRuns = candidateRuns(gray, xGrids, 'x');
  const yRuns = candidateRuns(gray, yGrids, 'y');

  let best: { x: Grid; y: Grid; coverage: number } | null = null;
  let bestRank: [number, number] | null = null;
  for (const x of xGrids) {
    const [left, right] = gridBounds(x);
    for (const y of yGrids) {
      const mismatch = Math.abs(x.spacing - y.spacing) / ((x.spacing + y.spacing) / 2);
      if (mismatch > S.SPACING_TOLERANCE) continue;
      const [top, bottom] = gridBounds(y);
      const covered =
        coveredLength(x.peaks, xRuns, top, bottom) + coveredLength(y.peaks, yRuns, left, right);
      const coverage = covered / (LINES * (right - left + (bottom - top)));
      // Rank by coverage (rounded, so near-equal coverage falls to strength), then by
      // strength; the first pair wins an exact tie.
      const rank: [number, number] = [Number(coverage.toFixed(12)), x.strength + y.strength];
      if (
        bestRank === null ||
        rank[0] > bestRank[0] ||
        (rank[0] === bestRank[0] && rank[1] > bestRank[1])
      ) {
        bestRank = rank;
        best = { x, y, coverage };
      }
    }
  }
  if (best === null) return { ok: false, reason: 'no-grid' };
  if (best.coverage < S.STRICT_MIN_COVERAGE) {
    return { ok: false, reason: 'low-coverage', coverage: best.coverage };
  }
  return { ok: true, ...best };
}

export type LocateResult =
  | {
      readonly ok: true;
      /** The board in whole pixels, pixel-edge coordinates, inside the image. */
      readonly rect: BoardRect;
      readonly coverage: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'no-grid' | 'low-coverage';
      readonly coverage?: number;
    };

/** Finds the board in an image, as a rect ready to crop. */
export function locateBoard(image: RgbaImage): LocateResult {
  const result = detectGrid(toGray(image));
  if (!result.ok) return result;
  // Pixel-centre bounds to pixel-edge coordinates (+0.5), whole pixels, inside the image.
  const edge = (value: number, size: number) =>
    Math.min(Math.max(Math.round(value + 0.5), 0), size);
  const [left, right] = gridBounds(result.x);
  const [top, bottom] = gridBounds(result.y);
  const x = edge(left, image.width);
  const y = edge(top, image.height);
  const rect = {
    x,
    y,
    width: edge(right, image.width) - x,
    height: edge(bottom, image.height) - y,
  };
  if (rect.width <= 0 || rect.height <= 0) return { ok: false, reason: 'no-grid' };
  return { ok: true, rect, coverage: result.coverage };
}
