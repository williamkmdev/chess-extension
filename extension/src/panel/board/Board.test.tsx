// @vitest-environment happy-dom
import { render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBoard, startingPosition } from '../../shared/position';
import { Board } from './Board';

let container: HTMLElement;

function renderBoard(element: preact.JSX.Element) {
  container = document.createElement('div');
  document.body.append(container);
  render(element, container);
  return container;
}

afterEach(() => {
  render(null, container);
  container.remove();
});

const squareEl = (root: HTMLElement, square: string) =>
  root.querySelector<HTMLElement>(`[data-square="${square}"]`);

describe('Board', () => {
  it('renders 64 squares with alternating colors (a1 dark, h1 light)', () => {
    const root = renderBoard(<Board board={emptyBoard()} orientation="w" />);
    expect(root.querySelectorAll('[data-square]')).toHaveLength(64);
    expect(squareEl(root, 'a1')?.classList.contains('dark')).toBe(true);
    expect(squareEl(root, 'h1')?.classList.contains('light')).toBe(true);
    expect(squareEl(root, 'e4')?.classList.contains('light')).toBe(true);
  });

  it('places pieces on their squares with accessible labels', () => {
    const root = renderBoard(<Board board={startingPosition().board} orientation="w" />);
    expect(root.querySelectorAll('img.piece')).toHaveLength(32);
    expect(squareEl(root, 'e1')?.getAttribute('aria-label')).toBe('e1, white king');
    expect(squareEl(root, 'd8')?.getAttribute('aria-label')).toBe('d8, black queen');
    expect(squareEl(root, 'e4')?.getAttribute('aria-label')).toBe('e4, empty');
    expect(squareEl(root, 'e4')?.querySelector('img')).toBeNull();
  });

  it('orders squares by orientation', () => {
    const order = (orientation: 'w' | 'b') => {
      const root = renderBoard(<Board board={emptyBoard()} orientation={orientation} />);
      const squares = [...root.querySelectorAll('[data-square]')].map((el) =>
        el.getAttribute('data-square'),
      );
      render(null, root);
      return squares;
    };
    expect(order('w').slice(0, 2)).toEqual(['a8', 'b8']);
    expect(order('b').slice(0, 2)).toEqual(['h1', 'g1']);
  });

  it('labels ranks on the left edge and files on the bottom edge', () => {
    const coords = (orientation: 'w' | 'b', kind: 'rank' | 'file') => {
      const root = renderBoard(<Board board={emptyBoard()} orientation={orientation} />);
      const labels = [...root.querySelectorAll(`.coord.${kind}`)].map((el) => el.textContent);
      render(null, root);
      return labels;
    };
    expect(coords('w', 'rank')).toEqual(['8', '7', '6', '5', '4', '3', '2', '1']);
    expect(coords('w', 'file')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(coords('b', 'rank')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(coords('b', 'file')).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });
});
