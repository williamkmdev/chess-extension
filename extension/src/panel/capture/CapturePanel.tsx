import { useEffect, useRef, useState } from 'preact/hooks';
import { captureTab, type CaptureVisibleTab, type Screenshot } from './captureTab';
import type { Rect, Size } from './crop';
import type { CropImage } from './cropImage';
import { CropView } from './CropView';
import type { FindBoard } from './findBoard';
import type { Recognize } from './recognize';
import type { DraftPosition } from '../../shared/position';
import type { TileReading } from '../../vision/classify';
import './capture.css';

export interface CapturePanelProps {
  readonly screenshot: Screenshot | null;
  /** The editor's draft. If it's edited while the pieces are read, what's read isn't loaded. */
  readonly position: DraftPosition;
  readonly capture: CaptureVisibleTab;
  readonly cropImage: CropImage;
  readonly findBoard: FindBoard;
  readonly recognize: Recognize;
  /** A new screenshot, a new crop of it, where the board is on it, or null when removed. */
  readonly onChange: (screenshot: Screenshot | null) => void;
  /** The pieces read on the board found, in screen order (top left first). */
  readonly onRecognized: (readings: readonly TileReading[]) => void;
}

/** What the panel is doing with what's shown. */
type Phase = 'locating' | 'reading' | null;
/** How reading the pieces on the board found went. */
type Reading = 'loaded' | 'edited' | 'no-model' | 'failed' | null;

/** What the board search and piece reading found, for the user. */
function boardNote(screenshot: Screenshot, reading: Reading): string | null {
  if (screenshot.board === undefined) return null;
  if (!screenshot.board) {
    return screenshot.crop
      ? 'Board not found. Try cropping closer around it.'
      : 'Board not found. Try cropping around it.';
  }
  switch (reading) {
    case 'loaded':
      return 'Board found. Position loaded: set the side to move and check the pieces.';
    case 'edited':
      return 'Board found. The position was edited meanwhile, so it was kept.';
    case 'no-model':
      return 'Board found. Piece recognition isn’t installed.';
    case 'failed':
      return 'Board found, but the pieces couldn’t be read.';
    case null:
      return 'Board found.';
  }
}

/**
 * Takes a screenshot of the tab on request and looks for the board on it. If it finds the
 * wrong board or none, the user can crop to the area to search (Crop); the
 * screenshot is then shown cropped to that area, for reference. The board found is
 * outlined on what's shown, and the pieces on it are read (`onRecognized`).
 */
export function CapturePanel({
  screenshot,
  position,
  capture,
  cropImage,
  findBoard,
  recognize,
  onChange,
  onRecognized,
}: CapturePanelProps) {
  const [busy, setBusy] = useState(false);
  /** Looking for the board in what's shown (or cropping to the area to search), then
   * reading its pieces. */
  const [phase, setPhase] = useState<Phase>(null);
  const [reading, setReading] = useState<Reading>(null);
  const [error, setError] = useState<string | null>(null);
  /** Selecting the area to search on the screenshot. */
  const [selecting, setSelecting] = useState(false);
  // Number each capture, and each change to what's shown (with its board search). A newer
  // one, or a choice that replaces it (Remove, Use whole screenshot), bumps the number, so
  // a result still pending is ignored.
  const request = useRef(0);
  const cropRequest = useRef(0);
  // The latest callback, for results that arrive after a newer render (e.g. after the
  // board was flipped while the pieces were being read).
  const latest = useRef({ onRecognized, position });
  latest.current = { onRecognized, position };

  // Hidden (e.g. on Confirm position) while a capture, search or reading is pending:
  // its result no longer applies.
  useEffect(
    () => () => {
      request.current += 1;
      cropRequest.current += 1;
    },
    [],
  );

  /**
   * Looks for the board in `current`'s crop (or all of it), records where it is, and
   * reads the pieces on it.
   */
  const searchBoard = async (current: Screenshot, id: number) => {
    const draft = latest.current.position;
    setPhase('locating');
    setReading(null);
    const region = current.crop?.rect;
    let board: Rect | null = null;
    try {
      const result = await (region
        ? findBoard(current.dataUrl, region)
        : findBoard(current.dataUrl));
      if (result.ok) board = result.rect;
    } catch (cause) {
      console.error('Couldn’t look for the board', cause);
    }
    if (id !== cropRequest.current) return;
    onChange({ ...current, board });
    if (!board) {
      setPhase(null);
      return;
    }

    setPhase('reading');
    let outcome: Reading;
    let readings: readonly TileReading[] | null = null;
    try {
      const result = await recognize(current.dataUrl, board);
      if (result.ok) readings = result.readings;
      outcome = result.ok ? 'loaded' : 'no-model';
    } catch (cause) {
      console.error('Couldn’t read the pieces', cause);
      outcome = 'failed';
    }
    if (id !== cropRequest.current) return;
    // Edits made meanwhile (an imported FEN, a cleared board) aren't overwritten.
    if (readings && latest.current.position !== draft) {
      readings = null;
      outcome = 'edited';
    }
    setPhase(null);
    setReading(outcome);
    if (readings) latest.current.onRecognized(readings);
  };

  const takeScreenshot = async () => {
    const id = ++request.current;
    cropRequest.current += 1;
    setBusy(true);
    setPhase(null);
    setReading(null);
    setError(null);
    const result = await captureTab(capture);
    if (id !== request.current) return;
    setBusy(false);
    if (result.ok) {
      // A crop of the previous screenshot, even one started meanwhile, no longer applies.
      const searchId = ++cropRequest.current;
      onChange(result.screenshot);
      setSelecting(false);
      await searchBoard(result.screenshot, searchId);
    } else {
      setError(result.error);
    }
  };

  /** Crops to the selected area and searches it. */
  const locateIn = async (current: Screenshot, rect: Rect) => {
    const id = ++cropRequest.current;
    setSelecting(false);
    setPhase('locating');
    setReading(null);
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await cropImage(current.dataUrl, rect);
    } catch (cause) {
      if (id !== cropRequest.current) return;
      setPhase(null);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`Couldn’t crop the screenshot: ${message}`);
      return;
    }
    if (id !== cropRequest.current) return;
    const cropped = { dataUrl: current.dataUrl, crop: { rect, dataUrl } };
    onChange(cropped);
    await searchBoard(cropped, id);
  };

  const useWhole = (current: Screenshot) => {
    const id = ++cropRequest.current;
    const whole = { dataUrl: current.dataUrl };
    onChange(whole);
    void searchBoard(whole, id);
  };

  const note = screenshot && !phase ? boardNote(screenshot, reading) : null;

  return (
    <section class="capture" aria-label="Screenshot">
      <div class="toolbar">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void takeScreenshot();
          }}
        >
          Capture tab
        </button>
        {screenshot && !selecting && (
          <button
            type="button"
            onClick={() => {
              setSelecting(true);
            }}
          >
            Crop
          </button>
        )}
        {screenshot?.crop && !selecting && (
          <button
            type="button"
            onClick={() => {
              useWhole(screenshot);
            }}
          >
            Use whole screenshot
          </button>
        )}
        {screenshot && (
          <button
            type="button"
            onClick={() => {
              request.current += 1;
              cropRequest.current += 1;
              setBusy(false);
              setPhase(null);
              setReading(null);
              setError(null);
              setSelecting(false);
              onChange(null);
            }}
          >
            Remove screenshot
          </button>
        )}
      </div>
      {busy && <p class="capture-status">Capturing…</p>}
      {phase === 'locating' && <p class="capture-status">Finding the board…</p>}
      {phase === 'reading' && <p class="capture-status">Reading the pieces…</p>}
      {note && (
        <p class="capture-note" role="status">
          {note}
        </p>
      )}
      {error && (
        <p class="capture-error" role="alert">
          {error}
        </p>
      )}
      {screenshot && selecting && (
        <CropView
          key={screenshot.dataUrl}
          dataUrl={screenshot.dataUrl}
          initial={screenshot.crop?.rect ?? null}
          onCrop={(rect) => {
            void locateIn(screenshot, rect);
          }}
          onCancel={() => {
            setSelecting(false);
          }}
        />
      )}
      {screenshot && !selecting && (
        <Shown
          key={screenshot.crop?.dataUrl ?? screenshot.dataUrl}
          screenshot={screenshot}
          outline={phase !== 'locating'}
        />
      )}
    </section>
  );
}

/** What's shown (the crop, or the whole screenshot), with the board found outlined if `outline`. */
function Shown({ screenshot, outline }: { screenshot: Screenshot; outline: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);

  // An image that's already loaded (e.g. from cache) may not fire load again.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth > 0) {
      setNatural({ width: element.naturalWidth, height: element.naturalHeight });
    }
  }, []);

  // The shown area, in screenshot pixels.
  const area: Rect | null = screenshot.crop?.rect ?? (natural ? { x: 0, y: 0, ...natural } : null);
  const board = outline ? screenshot.board : null;
  const percent = (value: number, total: number) => `${String((value / total) * 100)}%`;

  return (
    <figure class="screenshot">
      <img
        ref={image}
        src={screenshot.crop?.dataUrl ?? screenshot.dataUrl}
        alt={screenshot.crop ? 'The selected area of the screenshot' : 'Screenshot of the tab'}
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          setNatural({ width, height });
        }}
      />
      {board && area && (
        <div
          class="board-outline"
          aria-hidden="true"
          style={{
            left: percent(board.x - area.x, area.width),
            top: percent(board.y - area.y, area.height),
            width: percent(board.width, area.width),
            height: percent(board.height, area.height),
          }}
        />
      )}
    </figure>
  );
}
