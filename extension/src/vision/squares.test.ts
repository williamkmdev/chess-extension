import { describe, expect, it } from 'vitest';
import { boardSquares } from './squares';

describe('boardSquares', () => {
  it('splits a board whose size is not a multiple of 8 into touching cells', () => {
    const squares = boardSquares({ width: 517, height: 517 }, 'w');
    expect(squares).toHaveLength(64);
    const firstRow = squares.slice(0, 8);
    // Cells are 64 or 65 px, each starting where the previous one ended.
    let x = 0;
    for (const cell of firstRow) {
      expect(cell.x).toBe(x);
      expect([64, 65]).toContain(cell.width);
      x += cell.width;
    }
    expect(x).toBe(517);
    const firstColumn = squares.filter((_, i) => i % 8 === 0);
    expect(firstColumn.reduce((sum, cell) => sum + cell.height, 0)).toBe(517);
  });

  it('keeps every edge within half a pixel of its exact position', () => {
    for (const cell of boardSquares({ width: 517, height: 517 }, 'w').slice(0, 8)) {
      const index = Math.round(cell.x / (517 / 8));
      expect(Math.abs(cell.x - (index * 517) / 8)).toBeLessThanOrEqual(0.5);
    }
  });

  it('splits width and height independently for a crop that is not square', () => {
    const squares = boardSquares({ width: 400, height: 360 }, 'w');
    expect(squares[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 45 });
    expect(squares[63]).toMatchObject({ x: 350, y: 315, width: 50, height: 45 });
  });

  it('names the squares with White at the bottom: a8 top-left, h1 bottom-right', () => {
    const squares = boardSquares({ width: 800, height: 800 }, 'w');
    expect(squares[0]).toEqual({ square: 'a8', x: 0, y: 0, width: 100, height: 100 });
    expect(squares[7]?.square).toBe('h8');
    expect(squares[56]?.square).toBe('a1');
    expect(squares[63]).toEqual({ square: 'h1', x: 700, y: 700, width: 100, height: 100 });
  });

  it('names the squares with Black at the bottom: h1 top-left, a8 bottom-right', () => {
    const squares = boardSquares({ width: 800, height: 800 }, 'b');
    expect(squares[0]).toEqual({ square: 'h1', x: 0, y: 0, width: 100, height: 100 });
    expect(squares[63]).toEqual({ square: 'a8', x: 700, y: 700, width: 100, height: 100 });
  });

  it('covers every square exactly once', () => {
    for (const orientation of ['w', 'b'] as const) {
      const names = boardSquares({ width: 640, height: 640 }, orientation).map((s) => s.square);
      expect(new Set(names).size).toBe(64);
    }
  });
});
