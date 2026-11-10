import { describe, expect, it } from 'vitest';
import { displayRows } from './layout';

describe('displayRows', () => {
  it('shows White at the bottom with a8 top-left and h1 bottom-right', () => {
    const rows = displayRows('w');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual(['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8']);
    expect(rows[7]).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1']);
  });

  it('shows Black at the bottom with h1 top-left and a8 bottom-right', () => {
    const rows = displayRows('b');
    expect(rows[0]).toEqual(['h1', 'g1', 'f1', 'e1', 'd1', 'c1', 'b1', 'a1']);
    expect(rows[7]).toEqual(['h8', 'g8', 'f8', 'e8', 'd8', 'c8', 'b8', 'a8']);
  });

  it('contains every square exactly once in both orientations', () => {
    for (const orientation of ['w', 'b'] as const) {
      const squares = displayRows(orientation).flat();
      expect(squares).toHaveLength(64);
      expect(new Set(squares).size).toBe(64);
    }
  });

  it('flipping rotates the board 180 degrees', () => {
    const white = displayRows('w').flat();
    const black = displayRows('b').flat();
    expect(black).toEqual([...white].reverse());
  });
});
