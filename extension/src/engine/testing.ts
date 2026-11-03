// Test helpers shared by engine and UI tests. Not imported by production code.

import { confirmPosition } from '../shared/confirm';
import { parseFen } from '../shared/fen';
import type { ConfirmedPosition } from '../shared/position';
import type { EngineTransport } from './engine';

/** A scripted stand-in for the Stockfish worker. */
export class FakeTransport implements EngineTransport {
  readonly sent: string[] = [];
  terminated = false;
  /** Replies to the handshake automatically unless turned off. */
  autoHandshake = true;
  private handlers?: Parameters<EngineTransport['listen']>[0];

  send(command: string): void {
    this.sent.push(command);
    if (!this.autoHandshake) return;
    if (command === 'uci') {
      queueMicrotask(() => {
        this.emit('id name Stockfish 19', 'uciok');
      });
    }
    if (command === 'isready') {
      queueMicrotask(() => {
        this.emit('readyok');
      });
    }
  }
  listen(handlers: Parameters<EngineTransport['listen']>[0]): void {
    this.handlers = handlers;
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(...lines: string[]): void {
    for (const line of lines) this.handlers?.line(line);
  }
  crash(message: string): void {
    this.handlers?.error(new Error(message));
  }
  /** Commands sent after the handshake. */
  get searchCommands(): string[] {
    return this.sent.filter((command) => command !== 'uci' && command !== 'isready');
  }
}

/** Parses and confirms a FEN, throwing if it isn't a valid position. */
export function confirmed(fen: string): ConfirmedPosition {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error(`Bad test FEN '${fen}'`);
  const result = confirmPosition(parsed.position);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.position;
}
