// Reads the pieces on the located board with the piece model, in memory, using ONNX
// Runtime Web (WebAssembly, one thread). The runtime and the model are loaded on first
// use and then reused.
//
// The model file isn't part of the repository: the build copies it from
// extension/models/ when it's there (see docs/vision/recognition.md). Without it,
// recognition reports `no-model` and everything else keeps working.

import { readBoard, type Classifier, type TileReading } from '../../vision/classify';
import { TILE_SIZE } from '../../vision/tiles';
import type { Rect } from './crop';

export const MODEL_URL = '/models/chess_tiles.onnx';

export type RecognizeResult =
  | { readonly ok: true; readonly readings: readonly TileReading[] }
  | { readonly ok: false; readonly reason: 'no-model' };

/** Reads the pieces on the board at `board` (screenshot pixels). Injectable for tests. */
export type Recognize = (dataUrl: string, board: Rect) => Promise<RecognizeResult>;

/** The model's bytes, or null if it isn't installed. */
async function fetchModel(): Promise<Uint8Array | null> {
  let response: Response;
  try {
    response = await fetch(MODEL_URL);
  } catch {
    // An extension page can't fetch a file the extension doesn't have.
    return null;
  }
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function createClassifier(): Promise<Classifier | null> {
  const model = await fetchModel();
  if (!model) return null;
  // The runtime's .wasm is bundled by Vite next to this code, and found from there.
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  return async (input, count) => {
    const tiles = new ort.Tensor('float32', input, [count, 1, TILE_SIZE, TILE_SIZE]);
    const output = await session.run({ tiles });
    const probs = output.probs;
    if (!probs || !(probs.data instanceof Float32Array)) {
      throw new Error('The piece model gave no probabilities.');
    }
    return probs.data;
  };
}

let classifier: Promise<Classifier | null> | null = null;

/** The shared classifier, created on first use; a failed attempt is retried next time. */
function getClassifier(): Promise<Classifier | null> {
  classifier ??= createClassifier().catch((error: unknown) => {
    classifier = null;
    throw error;
  });
  return classifier;
}

export const recognizeWithOnnx: Recognize = async (dataUrl, board) => {
  const classify = await getClassifier();
  if (!classify) return { ok: false, reason: 'no-model' };
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser can’t read the screenshot’s pixels.');
  context.drawImage(image, 0, 0);
  const readings = await readBoard(context.getImageData(0, 0, width, height), board, classify);
  return { ok: true, readings };
};
