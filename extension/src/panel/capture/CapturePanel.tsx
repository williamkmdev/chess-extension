import { useRef, useState } from 'preact/hooks';
import { captureTab, type CaptureVisibleTab, type Screenshot } from './captureTab';
import type { Rect } from './crop';
import type { CropImage } from './cropImage';
import { CropView } from './CropView';
import './capture.css';

export interface CapturePanelProps {
  readonly screenshot: Screenshot | null;
  readonly capture: CaptureVisibleTab;
  readonly cropImage: CropImage;
  /** A new screenshot, a new crop of it, or null when removed. */
  readonly onChange: (screenshot: Screenshot | null) => void;
}

/** Takes a screenshot of the tab on request, lets the user crop it to the board, and shows it. */
export function CapturePanel({ screenshot, capture, cropImage, onChange }: CapturePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Selecting the board on the screenshot (true right after a capture). */
  const [cropping, setCropping] = useState(false);
  // Number each capture and each crop. A newer one, or a choice that replaces it (Remove,
  // Use whole screenshot), bumps the number, so a result still pending is ignored.
  const request = useRef(0);
  const cropRequest = useRef(0);

  const takeScreenshot = async () => {
    const id = ++request.current;
    cropRequest.current += 1;
    setBusy(true);
    setError(null);
    const result = await captureTab(capture);
    if (id !== request.current) return;
    setBusy(false);
    if (result.ok) {
      // A crop of the previous screenshot, even one started meanwhile, no longer applies.
      cropRequest.current += 1;
      onChange(result.screenshot);
      setCropping(true);
    } else {
      setError(result.error);
    }
  };

  const crop = async (current: Screenshot, rect: Rect) => {
    const id = ++cropRequest.current;
    setError(null);
    try {
      const dataUrl = await cropImage(current.dataUrl, rect);
      if (id !== cropRequest.current) return;
      onChange({ dataUrl: current.dataUrl, crop: { rect, dataUrl } });
      setCropping(false);
    } catch (cause) {
      if (id !== cropRequest.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`Couldn’t crop the screenshot: ${message}`);
    }
  };

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
          {screenshot ? 'Capture again' : 'Capture tab'}
        </button>
        {screenshot && !cropping && (
          <button
            type="button"
            onClick={() => {
              setCropping(true);
            }}
          >
            {screenshot.crop ? 'Crop again' : 'Crop'}
          </button>
        )}
        {screenshot && (
          <button
            type="button"
            onClick={() => {
              request.current += 1;
              cropRequest.current += 1;
              setBusy(false);
              setError(null);
              setCropping(false);
              onChange(null);
            }}
          >
            Remove screenshot
          </button>
        )}
      </div>
      {busy && <p class="capture-status">Capturing…</p>}
      {error && (
        <p class="capture-error" role="alert">
          {error}
        </p>
      )}
      {screenshot && cropping && (
        <CropView
          key={screenshot.dataUrl}
          dataUrl={screenshot.dataUrl}
          initial={screenshot.crop?.rect ?? null}
          onCrop={(rect) => {
            void crop(screenshot, rect);
          }}
          onUseWhole={() => {
            cropRequest.current += 1;
            onChange({ dataUrl: screenshot.dataUrl });
            setCropping(false);
          }}
        />
      )}
      {screenshot && !cropping && (
        <figure class="screenshot">
          <img
            src={screenshot.crop?.dataUrl ?? screenshot.dataUrl}
            alt={
              screenshot.crop ? 'The board, cropped from the screenshot' : 'Screenshot of the tab'
            }
          />
        </figure>
      )}
    </section>
  );
}
