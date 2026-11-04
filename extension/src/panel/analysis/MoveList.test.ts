import { describe, expect, it } from 'vitest';
import { keepInView } from './MoveList';

const rect = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) });

describe('keepInView', () => {
  // A list box showing screen rows 100–200, scrolled down by 50.
  const box = () => ({ scrollTop: 50, ...rect(100, 200) });

  it('leaves the box alone when the move is visible', () => {
    const list = box();
    keepInView(list, rect(120, 140));
    expect(list.scrollTop).toBe(50);
  });

  it('scrolls up just enough for a move above the box', () => {
    const list = box();
    keepInView(list, rect(80, 100));
    expect(list.scrollTop).toBe(30);
  });

  it('scrolls down just enough for a move below the box', () => {
    const list = box();
    keepInView(list, rect(210, 230));
    expect(list.scrollTop).toBe(80);
  });
});
