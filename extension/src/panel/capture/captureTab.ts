// Screenshot of the visible tab, taken only when the user asks for it. The image stays
// in the side panel's memory: it's never stored or sent anywhere.
//
// Permission: activeTab, which Chrome grants for a tab when the user clicks the
// extension's toolbar icon on it (that's also what opens the panel). It ends when that
// tab navigates to another site, so capturing then needs another click on the icon.

/** Takes the screenshot; resolves to a PNG data URL. Injectable for tests. */
export type CaptureVisibleTab = () => Promise<string>;

export const captureWithChrome: CaptureVisibleTab = () =>
  chrome.tabs.captureVisibleTab({ format: 'png' });

export interface Screenshot {
  /** PNG image as a data URL. */
  readonly dataUrl: string;
}

export type CaptureResult =
  | { readonly ok: true; readonly screenshot: Screenshot }
  | { readonly ok: false; readonly error: string };

export async function captureTab(capture: CaptureVisibleTab): Promise<CaptureResult> {
  try {
    const dataUrl = await capture();
    if (!dataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'The screenshot came back empty. Try again.' };
    }
    return { ok: true, screenshot: { dataUrl } };
  } catch (error) {
    return { ok: false, error: explainCaptureError(error) };
  }
}

/** Turns Chrome's capture errors into what the user can do about them. */
export function explainCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(chrome|chrome-extension|edge|about|devtools|view-source):|webstore/i.test(message)) {
    return 'Chrome doesn’t allow screenshots of its own pages (like chrome:// pages or the Chrome Web Store). Switch to the tab with the chessboard and try again.';
  }
  if (/activeTab|<all_urls>|permission/i.test(message)) {
    return 'Chrome didn’t give permission to capture this tab. Click the extension’s toolbar icon while you’re on the tab with the chessboard, then try again.';
  }
  if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(message)) {
    return 'Too many screenshots at once. Wait a moment and try again.';
  }
  return `Couldn’t capture the tab: ${message}`;
}
