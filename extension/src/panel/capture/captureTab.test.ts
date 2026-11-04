import { describe, expect, it } from 'vitest';
import { captureTab, explainCaptureError } from './captureTab';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('captureTab', () => {
  it('returns the screenshot', async () => {
    expect(await captureTab(() => Promise.resolve(PNG))).toEqual({
      ok: true,
      screenshot: { dataUrl: PNG },
    });
  });

  it('reports an empty result', async () => {
    const result = await captureTab(() => Promise.resolve(''));
    expect(result).toEqual({ ok: false, error: 'The screenshot came back empty. Try again.' });
  });

  it('turns a failed capture into an explanation', async () => {
    const result = await captureTab(() =>
      Promise.reject(new Error("Either the '<all_urls>' or 'activeTab' permission is required.")),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('toolbar icon');
  });
});

describe('explainCaptureError', () => {
  it.each([
    ['Cannot access contents of url "chrome://extensions/".', 'its own pages'],
    ['Cannot access a chrome:// URL', 'its own pages'],
    [
      'The extensions gallery cannot be scripted (chromewebstore.google.com/webstore).',
      'its own pages',
    ],
    ["Either the '<all_urls>' or 'activeTab' permission is required.", 'toolbar icon'],
    ['This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.', 'Wait a moment'],
  ])('%s', (message, expected) => {
    expect(explainCaptureError(new Error(message))).toContain(expected);
  });

  it('passes other errors through', () => {
    expect(explainCaptureError(new Error('No window'))).toBe('Couldn’t capture the tab: No window');
    expect(explainCaptureError('odd')).toBe('Couldn’t capture the tab: odd');
  });
});
