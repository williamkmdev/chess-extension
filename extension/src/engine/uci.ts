// UCI (Universal Chess Interface) protocol: building commands for the engine and
// parsing its output. Pure functions only; all UCI knowledge stays in this module.
//
// Perspective: UCI scores are relative to the side to move. `parseUciLine` keeps them
// that way (`EngineScore`); `toWhitePerspective` is the single place they are converted
// into the White-relative `Evaluation` used everywhere else.

import { toFen } from '../shared/fen';
import type { Color, ConfirmedPosition } from '../shared/position';

/** A move in UCI long algebraic notation, e.g. "e2e4" or "e7e8q". */
export type UciMove = string;

/** Whether a score is exact or only a bound (the search failed high or low). */
export type ScoreBound = 'exact' | 'lower' | 'upper';

/** A score as reported by the engine: relative to the side to move. */
export type EngineScore =
  | { readonly kind: 'cp'; readonly centipawns: number; readonly bound: ScoreBound }
  /** Positive: side to move mates in `moves`; negative: it gets mated; 0: it is mated now. */
  | { readonly kind: 'mate'; readonly moves: number; readonly bound: ScoreBound };

/** A score from White's perspective. Centipawns and mates are never mixed. */
export type Evaluation =
  | {
      readonly kind: 'cp';
      /** Positive favors White. */
      readonly centipawns: number;
      readonly bound: ScoreBound;
    }
  | {
      readonly kind: 'mate';
      /** The side delivering mate. */
      readonly winner: Color;
      /** Full moves until mate; 0 means the side to move is already checkmated. */
      readonly moves: number;
      readonly bound: ScoreBound;
    };

export interface InfoMessage {
  readonly type: 'info';
  readonly depth?: number;
  readonly selDepth?: number;
  /** Which line this is when several are requested (MultiPV); 1 is the best. */
  readonly multiPv: number;
  readonly score?: EngineScore;
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  /** Principal variation: the engine's expected line, starting with its best move. */
  readonly pv: readonly UciMove[];
}

export interface BestMoveMessage {
  readonly type: 'bestmove';
  /** null when there is no legal move (checkmate or stalemate). */
  readonly move: UciMove | null;
  readonly ponder?: UciMove;
}

export type EngineMessage =
  InfoMessage | BestMoveMessage | { readonly type: 'uciok' } | { readonly type: 'readyok' };

export interface SearchLimits {
  readonly depth?: number;
  readonly movetimeMs?: number;
  readonly nodes?: number;
  /** Search until `stop`. Ignored if any other limit is set. */
  readonly infinite?: boolean;
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isUciMove(text: string): boolean {
  return UCI_MOVE.test(text);
}

// --- Commands --------------------------------------------------------------------

export const UCI = 'uci';
export const IS_READY = 'isready';
export const NEW_GAME = 'ucinewgame';
export const STOP = 'stop';
export const QUIT = 'quit';

/** Only confirmed positions can be sent to the engine. */
export function positionCommand(position: ConfirmedPosition): string {
  return `position fen ${toFen(position)}`;
}

export function goCommand(limits: SearchLimits): string {
  const parts = ['go'];
  if (limits.depth !== undefined) parts.push('depth', positiveInt(limits.depth, 'depth'));
  if (limits.movetimeMs !== undefined) {
    parts.push('movetime', positiveInt(limits.movetimeMs, 'movetimeMs'));
  }
  if (limits.nodes !== undefined) parts.push('nodes', positiveInt(limits.nodes, 'nodes'));
  if (parts.length === 1) parts.push('infinite');
  return parts.join(' ');
}

const OPTION_TEXT = /^[\w .+-]+$/;

/** `setoption`; names and values are restricted so they can't inject extra commands. */
export function setOptionCommand(name: string, value: string | number | boolean): string {
  const text = String(value);
  if (!OPTION_TEXT.test(name) || !OPTION_TEXT.test(text)) {
    throw new Error(`Unsafe UCI option: ${JSON.stringify(name)} = ${JSON.stringify(text)}`);
  }
  return `setoption name ${name} value ${text}`;
}

function positiveInt(value: number, name: string): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive whole number, got ${String(value)}`);
  }
  return String(value);
}

// --- Parsing ---------------------------------------------------------------------

/**
 * Parses one line of engine output. Returns null for lines this app doesn't use
 * (e.g. `id`, `option`, `info string`, `info currmove`) and for malformed lines.
 */
export function parseUciLine(line: string): EngineMessage | null {
  const tokens = line.trim().split(/\s+/);
  switch (tokens[0]) {
    case 'uciok':
      return { type: 'uciok' };
    case 'readyok':
      return { type: 'readyok' };
    case 'bestmove':
      return parseBestMove(tokens);
    case 'info':
      return parseInfo(tokens);
    default:
      return null;
  }
}

function parseBestMove(tokens: readonly string[]): BestMoveMessage | null {
  const move = tokens[1];
  if (move === undefined) return null;
  if (move === '(none)' || move === '0000') return { type: 'bestmove', move: null };
  if (!isUciMove(move)) return null;
  const ponder = tokens[2] === 'ponder' ? tokens[3] : undefined;
  return ponder !== undefined && isUciMove(ponder)
    ? { type: 'bestmove', move, ponder }
    : { type: 'bestmove', move };
}

const INTEGER = /^-?\d+$/;

function parseInfo(tokens: readonly string[]): InfoMessage | null {
  // Free-text and progress-only lines carry nothing we use.
  if (tokens[1] === 'string' || tokens.includes('currmove')) return null;

  let depth: number | undefined;
  let selDepth: number | undefined;
  let multiPv = 1;
  let score: EngineScore | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;
  let timeMs: number | undefined;
  let pv: UciMove[] = [];

  const int = (index: number): number | undefined => {
    const token = tokens[index];
    return token !== undefined && INTEGER.test(token) ? Number(token) : undefined;
  };

  for (let i = 1; i < tokens.length; i += 1) {
    switch (tokens[i]) {
      case 'depth':
        depth = int(++i);
        break;
      case 'seldepth':
        selDepth = int(++i);
        break;
      case 'multipv':
        multiPv = int(++i) ?? 1;
        break;
      case 'nodes':
        nodes = int(++i);
        break;
      case 'nps':
        nps = int(++i);
        break;
      case 'time':
        timeMs = int(++i);
        break;
      case 'score': {
        const kind = tokens[i + 1];
        const value = int(i + 2);
        if ((kind !== 'cp' && kind !== 'mate') || value === undefined) return null;
        i += 2;
        let bound: ScoreBound = 'exact';
        if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
          bound = tokens[i + 1] === 'lowerbound' ? 'lower' : 'upper';
          i += 1;
        }
        score =
          kind === 'cp'
            ? { kind: 'cp', centipawns: value, bound }
            : { kind: 'mate', moves: value, bound };
        break;
      }
      case 'pv':
        // The principal variation runs to the end of the line.
        pv = tokens.slice(i + 1);
        if (!pv.every(isUciMove)) return null;
        i = tokens.length;
        break;
      default:
        // Fields we don't use (hashfull, tbhits, wdl, ...): skip the keyword only.
        break;
    }
  }

  return {
    type: 'info',
    ...(depth !== undefined && { depth }),
    ...(selDepth !== undefined && { selDepth }),
    multiPv,
    ...(score !== undefined && { score }),
    ...(nodes !== undefined && { nodes }),
    ...(nps !== undefined && { nps }),
    ...(timeMs !== undefined && { timeMs }),
    pv,
  };
}

// --- Perspective -----------------------------------------------------------------

/** Converts an engine score (side-to-move relative) to White's perspective. */
export function toWhitePerspective(score: EngineScore, sideToMove: Color): Evaluation {
  const flip = sideToMove === 'b';
  // A bound flips with the sign: "at least x for Black" is "at most -x for White".
  const bound: ScoreBound =
    flip && score.bound !== 'exact' ? (score.bound === 'lower' ? 'upper' : 'lower') : score.bound;

  if (score.kind === 'cp') {
    // `0 - x` rather than `-x`, so an even score stays 0 and never becomes -0.
    return { kind: 'cp', centipawns: flip ? 0 - score.centipawns : score.centipawns, bound };
  }
  const opponent: Color = sideToMove === 'w' ? 'b' : 'w';
  // mate 0 and negative values: the side to move is (being) mated.
  const winner = score.moves > 0 ? sideToMove : opponent;
  return { kind: 'mate', winner, moves: Math.abs(score.moves), bound };
}
