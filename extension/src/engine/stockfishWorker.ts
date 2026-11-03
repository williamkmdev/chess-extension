// The only browser-specific engine code: runs the bundled Stockfish build in a Web
// Worker. The files are copied unchanged to dist/engine/ by the build (vite.config.ts);
// the .js loads the .wasm beside it.

import type { EngineTransport } from './engine';

export const STOCKFISH_WORKER_URL = '/engine/stockfish-19-lite-single.js';

export function createStockfishTransport(url: string = STOCKFISH_WORKER_URL): EngineTransport {
  const worker = new Worker(url);
  return {
    send(command) {
      worker.postMessage(command);
    },
    listen({ line, error }) {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') return;
        for (const text of event.data.split('\n')) line(text);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        error(new Error(event.message || 'The engine failed to load.'));
      };
    },
    terminate() {
      worker.terminate();
    },
  };
}
