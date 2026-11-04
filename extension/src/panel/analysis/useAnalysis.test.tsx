// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { confirmed, FakeTransport } from '../../engine/testing';
import type { ConfirmedPosition } from '../../shared/position';
import { useAnalysis } from './useAnalysis';

const container = document.createElement('div');
let transport: FakeTransport | null = null;
const createTransport = () => (transport = new FakeTransport());

function Probe({ position }: { position: ConfirmedPosition | null }) {
  const analysis = useAnalysis(position, null, { createTransport });
  const update = 'update' in analysis ? analysis.update : null;
  return (
    <p>
      {analysis.status} {update ? `${String(update.depth)}:${update.pv.join(' ')}` : '-'}
    </p>
  );
}

/** Let the fake engine's handshake (microtasks) and the resulting renders finish. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

afterEach(() => {
  render(null, container);
  transport = null;
});

it('never shows the previous position’s result against a new position', async () => {
  const first = confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const second = confirmed('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await act(() => {
    render(<Probe position={first} />, container);
  });
  await settle();
  await act(() => {
    transport?.emit('info depth 12 score cp 30 pv e2e4 e7e5');
  });
  await settle();
  expect(container.textContent).toBe('analyzing 12:e2e4 e7e5');

  // Rendered outside act(): effects haven't run yet, as in the browser's first frame.
  render(<Probe position={second} />, container);
  expect(container.textContent).toBe('analyzing -');

  render(<Probe position={null} />, container);
  expect(container.textContent).toBe('idle -');
});
