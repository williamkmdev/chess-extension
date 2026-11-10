// Checks the local piece model against the contract the extension codes to. The model
// isn't in the repository (see docs/vision/recognition.md), so this is skipped unless
// extension/models/ holds it. It checks the contract only, not accuracy.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLASS_COUNT, LABELS, readTiles } from '../src/vision/classify';
import { TILE_SIZE } from '../src/vision/tiles';

const models = fileURLToPath(new URL('../models/', import.meta.url));
const present = ['chess_tiles.onnx', 'model_metadata.json'].every((name) =>
  existsSync(models + name),
);

interface Metadata {
  labels: string;
  input_name: string;
  input_shape: [string, number, number, number];
  input_dtype: string;
  output_name: string;
  output_shape: [string, number];
  softmax_included: boolean;
  grayscale_weights: [number, number, number];
  board_resize: string;
}

describe.skipIf(!present)('the local piece model', () => {
  const metadata = (): Metadata =>
    JSON.parse(readFileSync(models + 'model_metadata.json', 'utf8')) as Metadata;

  it('matches the contract the extension codes to', () => {
    const model = metadata();
    expect(model.labels).toBe(LABELS);
    expect(model.input_name).toBe('tiles');
    expect(model.input_shape.slice(1)).toEqual([1, TILE_SIZE, TILE_SIZE]);
    expect(model.input_dtype).toBe('float32');
    expect(model.output_name).toBe('probs');
    expect(model.output_shape[1]).toBe(CLASS_COUNT);
    expect(model.softmax_included).toBe(true);
    expect(model.grayscale_weights).toEqual([0.299, 0.587, 0.114]);
    expect(model.board_resize).toBe('256x256 half-pixel bilinear, edge clamp');
  });

  it('runs in ONNX Runtime Web: 64 tiles in, a probability row for each out', async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(
      new Uint8Array(readFileSync(models + 'chess_tiles.onnx')),
      { executionProviders: ['wasm'] },
    );
    const input = new Float32Array(64 * TILE_SIZE * TILE_SIZE).fill(0.5);
    const output = await session.run({
      tiles: new ort.Tensor('float32', input, [64, 1, TILE_SIZE, TILE_SIZE]),
    });
    const probs = output.probs?.data;
    expect(probs).toBeInstanceOf(Float32Array);
    if (!(probs instanceof Float32Array)) return;
    expect(probs).toHaveLength(64 * CLASS_COUNT);
    for (let tile = 0; tile < 64; tile += 1) {
      const row = probs.subarray(tile * CLASS_COUNT, (tile + 1) * CLASS_COUNT);
      expect(row.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 4);
    }
    expect(readTiles(probs)).toHaveLength(64);
    await session.release();
  });
});
