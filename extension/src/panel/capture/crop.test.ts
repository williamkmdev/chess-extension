import { describe, expect, it } from 'vitest';
import {
  moveSelection,
  resizeSelection,
  roundRect,
  selectionFromDrag,
  toImagePoint,
  type SelectionOptions,
} from './crop';

const bounds = { width: 1000, height: 600 };
const free: SelectionOptions = { square: false, bounds, minSize: 10 };
const square: SelectionOptions = { ...free, square: true };

describe('toImagePoint', () => {
  // A 2000×1200 capture (2× device pixels) shown 500×300 at (20, 40).
  const displayed = { left: 20, top: 40, width: 500, height: 300 };
  const natural = { width: 2000, height: 1200 };

  it('scales from the displayed image to its own pixels', () => {
    expect(toImagePoint({ x: 20, y: 40 }, displayed, natural)).toEqual({ x: 0, y: 0 });
    expect(toImagePoint({ x: 270, y: 190 }, displayed, natural)).toEqual({ x: 1000, y: 600 });
    expect(toImagePoint({ x: 520, y: 340 }, displayed, natural)).toEqual({ x: 2000, y: 1200 });
  });

  it('clamps points outside the image to its edges', () => {
    expect(toImagePoint({ x: 0, y: 1000 }, displayed, natural)).toEqual({ x: 0, y: 1200 });
  });

  it('is safe while the image has no size yet', () => {
    expect(toImagePoint({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, natural)).toEqual(
      { x: 0, y: 0 },
    );
  });
});

describe('selectionFromDrag', () => {
  it.each([
    ['right and down', { x: 400, y: 300 }, { x: 100, y: 100, width: 300, height: 200 }],
    ['left and up', { x: 50, y: 20 }, { x: 50, y: 20, width: 50, height: 80 }],
    ['right and up', { x: 300, y: 50 }, { x: 100, y: 50, width: 200, height: 50 }],
    ['left and down', { x: 40, y: 500 }, { x: 40, y: 100, width: 60, height: 400 }],
  ])('spans the drag %s', (_label, current, expected) => {
    expect(selectionFromDrag({ x: 100, y: 100 }, current, free)).toEqual(expected);
  });

  it('keeps a square selection, growing towards the pointer by the larger distance', () => {
    expect(selectionFromDrag({ x: 100, y: 100 }, { x: 400, y: 200 }, square)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 300,
    });
    expect(selectionFromDrag({ x: 500, y: 400 }, { x: 450, y: 100 }, square)).toEqual({
      x: 200,
      y: 100,
      width: 300,
      height: 300,
    });
  });

  it('stops a square at the nearest image edge in the drag direction', () => {
    // Only 100 px below the start point.
    expect(selectionFromDrag({ x: 100, y: 500 }, { x: 900, y: 590 }, square)).toEqual({
      x: 100,
      y: 500,
      width: 100,
      height: 100,
    });
  });

  it('clamps a free selection to the image', () => {
    expect(selectionFromDrag({ x: 900, y: 500 }, { x: 1200, y: 900 }, free)).toEqual({
      x: 900,
      y: 500,
      width: 100,
      height: 100,
    });
  });

  it('is never smaller than the minimum, staying inside the image', () => {
    expect(selectionFromDrag({ x: 100, y: 100 }, { x: 102, y: 101 }, free)).toEqual({
      x: 100,
      y: 100,
      width: 10,
      height: 10,
    });
    // At the bottom-right corner, the minimum box shifts back inside.
    expect(selectionFromDrag({ x: 1000, y: 600 }, { x: 1000, y: 600 }, square)).toEqual({
      x: 990,
      y: 590,
      width: 10,
      height: 10,
    });
  });
});

describe('moveSelection', () => {
  const rect = { x: 100, y: 100, width: 200, height: 200 };

  it('moves by the given amount', () => {
    expect(moveSelection(rect, 50, -30, bounds)).toEqual({ ...rect, x: 150, y: 70 });
  });

  it.each([
    ['left', -500, 0, { x: 0, y: 100 }],
    ['right', 5000, 0, { x: 800, y: 100 }],
    ['up', 0, -500, { x: 100, y: 0 }],
    ['down', 0, 5000, { x: 100, y: 400 }],
  ])('stops at the %s edge', (_label, dx, dy, position) => {
    expect(moveSelection(rect, dx, dy, bounds)).toEqual({ ...rect, ...position });
  });
});

describe('resizeSelection', () => {
  const rect = { x: 100, y: 100, width: 200, height: 200 };

  it.each([
    ['se', { x: 350, y: 320 }, { x: 100, y: 100, width: 250, height: 220 }],
    ['nw', { x: 50, y: 80 }, { x: 50, y: 80, width: 250, height: 220 }],
    ['ne', { x: 350, y: 80 }, { x: 100, y: 80, width: 250, height: 220 }],
    ['sw', { x: 50, y: 320 }, { x: 50, y: 100, width: 250, height: 220 }],
  ] as const)('drags the %s corner, keeping the opposite one', (corner, point, expected) => {
    expect(resizeSelection(rect, corner, point, free)).toEqual(expected);
  });

  it('keeps a square while resizing', () => {
    expect(resizeSelection(rect, 'se', { x: 350, y: 320 }, square)).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 250,
    });
  });

  it('flips when dragged past the opposite corner', () => {
    // Opposite corner of 'se' is (100, 100); dragging to (60, 40) flips up-left.
    expect(resizeSelection(rect, 'se', { x: 60, y: 40 }, free)).toEqual({
      x: 60,
      y: 40,
      width: 40,
      height: 60,
    });
  });
});

describe('roundRect', () => {
  it('rounds to whole pixels inside the image', () => {
    expect(roundRect({ x: 10.4, y: 20.6, width: 99.5, height: 50.2 }, bounds)).toEqual({
      x: 10,
      y: 21,
      width: 100,
      height: 50,
    });
    expect(roundRect({ x: 999.7, y: 0, width: 5, height: 5 }, bounds)).toEqual({
      x: 999,
      y: 0,
      width: 1,
      height: 5,
    });
  });
});
