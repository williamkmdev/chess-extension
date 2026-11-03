// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';

const container = document.createElement('div');

afterEach(() => {
  render(null, container);
  container.remove();
});

it('shows the starting position and flips the board', async () => {
  document.body.append(container);
  await act(() => {
    render(<App />, container);
  });
  const firstSquare = () => container.querySelector('[data-square]')?.getAttribute('data-square');
  const flip = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Flip board',
  );
  if (!flip) throw new Error('Flip button not found');

  expect(container.querySelectorAll('img.piece')).toHaveLength(32);
  expect(firstSquare()).toBe('a8');

  await act(() => {
    flip.click();
  });
  expect(firstSquare()).toBe('h1');

  await act(() => {
    flip.click();
  });
  expect(firstSquare()).toBe('a8');
});
