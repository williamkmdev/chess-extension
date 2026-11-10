import { useEffect, useRef, useState } from 'preact/hooks';
import { captureTab, type CaptureVisibleTab, type Screenshot } from './captureTab';
import type { Rect, Size } from './crop';
import type { CropImage } from './cropImage';
import { CropView } from './CropView';
import type { FindBoard } from './findBoard';
import './capture.css';

export interface CapturePanelProps {
  readonly screenshot: Screenshot | null;
  readonly capture: CaptureVisibleTab;
  readonly cropImage: CropImage;
  readonly findBoard: FindBoard;
  /** A new screenshot, a new crop of it, where the board is on it, or null when removed. */
  readonly onChange: (screenshot: Screenshot | null) => void;
}

/** What the board search found, for the user. */
function boardNote(screenshot: Screenshot): string | null {
  if (screenshot.board === undefined) return null;
  if (screenshot.board) return 'Board found.';
  return screenshot.crop
    ? 'Board not found. Try cropping closer around it.'
    : 'Board not found. Try cropping around it.';
}

/**
 * Takes a screenshot of the tab on request and looks for the board on it. If it finds the
 * wrong board or none, the user can crop to the area to search (Crop); the
 * screenshot is then shown cropped to that area, for reference. The board found is
 * outlined on what's shown.
 */
export function CapturePanel({
  screenshot,
  capture,
  cropImage,
  findBoard,
  onChange,
}: CapturePanelProps) {
  const [busy, setBusy] = useState(false);
  /** Looking for the board in what's shown (or cropping to the area to search). */
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Selecting the area to search on the screenshot. */
  const [selecting, setSelecting] = useState(false);
  // Number each capture, and each change to what's shown (with its board search). A newer
  // one, or a choice that replaces it (Remove, Use whole screenshot), bumps the number, so
  // a result still pending is ignored.
  const request = useRef(0);
  const cropRequest = useRef(0);

  /** Looks for the board in `current`'s crop (or all of it) and records where it is. */
  const searchBoard = async (current: Screenshot, id: number) => {
    setLocating(true);
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
    setLocating(false);
    onChange({ ...current, board });
  };

  const takeScreenshot = async () => {
    const id = ++request.current;
    cropRequest.current += 1;
    setBusy(true);
    setLocating(false);
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
    setLocating(true);
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await cropImage(current.dataUrl, rect);
    } catch (cause) {
      if (id !== cropRequest.current) return;
      setLocating(false);
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

  const note = screenshot && !locating ? boardNote(screenshot) : null;

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
              setLocating(false);
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
      {locating && <p class="capture-status">Finding the board…</p>}
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
          outline={!locating}
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
