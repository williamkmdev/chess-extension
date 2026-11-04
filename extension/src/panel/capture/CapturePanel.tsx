import { useRef, useState } from 'preact/hooks';
import { captureTab, type CaptureVisibleTab, type Screenshot } from './captureTab';
import './capture.css';

export interface CapturePanelProps {
  readonly screenshot: Screenshot | null;
  readonly capture: CaptureVisibleTab;
  readonly onCaptured: (screenshot: Screenshot) => void;
  readonly onRemove: () => void;
}

/** Takes a screenshot of the tab on request and shows it. */
export function CapturePanel({ screenshot, capture, onCaptured, onRemove }: CapturePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Numbers each capture; Remove bumps it so a capture still pending is ignored.
  const request = useRef(0);

  const takeScreenshot = async () => {
    const id = ++request.current;
    setBusy(true);
    setError(null);
    const result = await captureTab(capture);
    if (id !== request.current) return;
    setBusy(false);
    if (result.ok) onCaptured(result.screenshot);
    else setError(result.error);
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
        {screenshot && (
          <button
            type="button"
            onClick={() => {
              request.current += 1;
              setBusy(false);
              setError(null);
              onRemove();
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
      {screenshot && (
        <figure class="screenshot">
          <img src={screenshot.dataUrl} alt="Screenshot of the tab" />
        </figure>
      )}
    </section>
  );
}
