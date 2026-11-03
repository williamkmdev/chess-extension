// @vitest-environment happy-dom
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameTool, Palette, type Tool } from './Palette';

const container = document.createElement('div');

afterEach(() => {
  render(null, container);
  container.remove();
});

function renderPalette(selected: Tool | null) {
  const onSelect = vi.fn<(tool: Tool | null) => void>();
  document.body.append(container);
  render(
    <Palette selected={selected} onSelect={onSelect} onPiecePointerDown={vi.fn()} />,
    container,
  );
  const button = (label: string) => {
    const found = [...container.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent) === label,
    );
    if (!found) throw new Error(`No button '${label}'`);
    return found;
  };
  return { onSelect, button };
}

describe('Palette', () => {
  it('shows all 12 pieces and an eraser', () => {
    const { button } = renderPalette(null);
    expect(container.querySelectorAll('.palette-piece')).toHaveLength(12);
    expect(button('white king')).toBeDefined();
    expect(button('black pawn')).toBeDefined();
    expect(button('Eraser')).toBeDefined();
  });

  it('selects a piece tool on click', () => {
    const { onSelect, button } = renderPalette(null);
    button('black knight').click();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'piece', piece: { color: 'b', type: 'n' } });
  });

  it('marks the selected tool as pressed', () => {
    const { button } = renderPalette({ kind: 'piece', piece: { color: 'w', type: 'q' } });
    expect(button('white queen').getAttribute('aria-pressed')).toBe('true');
    expect(button('black queen').getAttribute('aria-pressed')).toBe('false');
    expect(button('Eraser').getAttribute('aria-pressed')).toBe('false');
  });

  it('deselects when the selected tool is clicked again', () => {
    const { onSelect, button } = renderPalette({ kind: 'eraser' });
    button('Eraser').click();
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('isSameTool', () => {
  const knight: Tool = { kind: 'piece', piece: { color: 'w', type: 'n' } };
  it('compares tools by kind and piece', () => {
    expect(isSameTool(knight, { kind: 'piece', piece: { color: 'w', type: 'n' } })).toBe(true);
    expect(isSameTool(knight, { kind: 'piece', piece: { color: 'b', type: 'n' } })).toBe(false);
    expect(isSameTool(knight, { kind: 'eraser' })).toBe(false);
    expect(isSameTool({ kind: 'eraser' }, { kind: 'eraser' })).toBe(true);
    expect(isSameTool(null, null)).toBe(false);
    expect(isSameTool(knight, null)).toBe(false);
  });
});
