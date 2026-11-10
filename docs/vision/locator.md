# Board locator

`extension/src/vision/locate.ts` finds an axis-aligned 8×8 chessboard in a screenshot.
It is a step-for-step TypeScript port of the project's Python prototype, `check_all.py`.
That prototype is kept outside the repository.

The extension runs the locator on whatever the capture panel shows:

- After a capture, it searches the whole screenshot.
- If it finds the wrong board (say, with two boards on screen) or none, the user can
  click **Crop**, drag a rough box around the board, and click **Crop** again to search only
  there. The panel then shows that area, cropped, for reference.
- **Use whole screenshot** drops the box and searches the whole screenshot again.

The locator never changes the screenshot or the user's box. It records where the board
is (`Screenshot.board`, in screenshot pixels, or `null` when none is found). The panel
outlines the board on what's shown and says whether one was found. Splitting into squares
(`vision/squares.ts`) and piece recognition work from that recorded board.

## Pipeline

1. **Grayscale.** Pillow's `convert("L")`:
   `(R·19595 + G·38470 + B·7471 + 0x8000) >> 16`.
2. **Boundary profiles.** For each boundary between adjacent columns (and rows), the
   score is the sum of rising changes × the sum of falling changes across it. A
   checkerboard boundary has both directions.
3. **Peaks.** Positive local maxima within ±`round(0.005 × axis length)`. Equal maxima
   all survive.
4. **Seven-line fits per axis.** Every pair of peaks is tried as the first and seventh
   interior line:
   - the spacing must be over 4 px;
   - the nearest peak is matched to each predicted line, within 4 px;
   - a least-squares line is fitted;
   - every line must be within 2 px of the fit.
5. **Transition runs on each candidate line.**
   - Pixels are compared `round(0.003 × axis length)` apart, across the line.
   - Changes must be ≥ 20 grey levels, keep the same sign, and stay within 1.8× of the
     run's running mean.
   - A run must be at least 1% of the image's smaller side long.
6. **Pairing.** Each vertical grid is paired with each horizontal grid whose cell size
   is within 10% of its own.
   - The pair's **coverage** is the share of its 14 interior lines' total length that
     runs cover.
   - Pairs are ranked by coverage, then by peak strength.
7. **Accept** the best pair if its coverage is at least 0.80.

The constants are in `LOCATE_SETTINGS`, under the prototype's names. Where the
prototype does float32 arithmetic (NumPy), the port rounds with `Math.fround`, so ties
and thresholds behave the same. Python's `round` (halves to even) is ported as
`roundHalfEven`.

## Coordinates

Internally, as in the prototype, a pixel's centre is at its index. So the boundary
between pixels `i` and `i+1` is at `i + 0.5`.

`locateBoard` returns its rect in **pixel-edge** coordinates: pixel `i` spans
`[i, i+1]`, which is what canvas cropping uses. So the bounds are shifted by +0.5,
rounded to whole pixels, and clamped to the image. On the labelled synthetic images, this
gives the labelled rect exactly.

A result found inside a manual selection is offset back into screenshot pixels by
`toScreenshotRect`.

## Failure reasons

| Reason         | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `no-grid`      | No compatible pair of seven-line grids was found.                           |
| `low-coverage` | A pair was found, but its coverage is below 0.80. The coverage is reported. |

## Differences from the prototype

- **Distinct failure reasons.** The prototype prints the same message for both.
- **Pixel-edge rect.** The result is shifted +0.5, rounded, and clamped to the image.

## Known limitations

These are carried over from the prototype; its values are heuristics, not calibrated.

- **Occlusion.** All seven interior lines must be visible on each axis. A banner, face
  cam, or caption over a line prevents detection.
- **Missing peaks.** A stronger edge nearby can suppress a real line's peak.
- **Geometry.** There's no support for perspective, rotation, or curved boards.
- **Off-by-one cells.** A board's border can be mistaken for an interior line, shifting
  the rect by one cell.
- **No checkerboard check.** Coverage checks transitions along lines, not that the
  squares alternate. Repeated non-board structure, or a 7×7 pattern next to its border,
  can pass.
- **Fixed pixel tolerances.** The 2 px and 4 px tolerances behave differently at
  different resolutions.

## Parity check

`extension/test/locate.parity.test.ts` compares the port with the prototype on a local
image set. The images are never committed. The test is skipped unless
`LOCATOR_PARITY_DIR` points to an export holding:

- `<image name>.rgba.gz`: gzip of the image's raw RGBA bytes, from Pillow's
  `convert("RGBA")`;
- `expected.json`, keyed by image name: `{ width, height, pythonMs, board }`, where
  `board` is `null` or `{ left, right, top, bottom, coverage }`. These are the
  prototype's `Grid.bounds`, in pixel-centre coordinates, plus the coverage.

Both sides get the same raw pixels, so image decoding differences are out of the
comparison. Run it from `extension/`:

```sh
LOCATOR_PARITY_DIR=/path/to/export npx vitest run --configLoader runner test/locate.parity.test.ts
```

### Results (2026-11-09)

The local set has 27 images: real screenshots (Lichess, chess.com, YouTube streams,
Wikipedia) and synthetic test cards.

- **Parity:** 27/27 give the same verdict as the prototype. Every found board's bounds
  match to 10⁻⁶ px, and coverage matches to 10⁻⁹.
- **Verdicts:**
  - 23 found;
  - 4 not found: 3 `low-coverage` (an isoluminant board, an occluded board, and one real
    screenshot) and 1 `no-grid` (a page without a board).
- **Speed** (Node 22, one thread):
  - real 1080p-class screenshots: 35–355 ms, median about 120 ms;
  - small synthetic images: under 50 ms.

  The prototype took 200–990 ms on the same real screenshots.

- **Labelled synthetic images:**
  - Every found board matches its label exactly.
  - The 7×7 decoy is accepted (the limitation above).
  - With two boards side by side, only the first one is reported.

This is parity with the prototype on a small, mostly hand-picked set, not a general
accuracy figure.
