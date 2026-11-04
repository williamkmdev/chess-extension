import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener<T extends unknown[]> = (...args: T) => void;

/** A minimal fake of the chrome APIs the background worker uses. */
function fakeChrome() {
  let onInstalled: Listener<[]> | undefined;
  let onClicked: Listener<[Partial<chrome.tabs.Tab>]> | undefined;
  const api = {
    runtime: {
      onInstalled: {
        addListener: (listener: Listener<[]>) => {
          onInstalled = listener;
        },
      },
    },
    action: {
      onClicked: {
        addListener: (listener: Listener<[Partial<chrome.tabs.Tab>]>) => {
          onClicked = listener;
        },
      },
    },
    sidePanel: {
      setPanelBehavior: vi.fn(() => Promise.resolve()),
      open: vi.fn(() => Promise.resolve()),
    },
  };
  return {
    api,
    install: () => onInstalled?.(),
    click: (tab: Partial<chrome.tabs.Tab>) => onClicked?.(tab),
  };
}

let fake: ReturnType<typeof fakeChrome>;

beforeEach(async () => {
  vi.resetModules();
  fake = fakeChrome();
  vi.stubGlobal('chrome', fake.api);
  await import('../src/background/index');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('background worker', () => {
  it('lets toolbar clicks reach the extension (so they grant activeTab)', () => {
    fake.install();
    expect(fake.api.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
  });

  it('opens the side panel for the clicked tab', () => {
    fake.click({ id: 7, windowId: 2 });
    expect(fake.api.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });
  });

  it('falls back to the window when the tab has no id', () => {
    fake.click({ windowId: 2 });
    expect(fake.api.sidePanel.open).toHaveBeenCalledWith({ windowId: 2 });
  });

  it('logs a failure to open instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fake.api.sidePanel.open.mockReturnValueOnce(Promise.reject(new Error('no window')));
    fake.click({ id: 7, windowId: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith('Failed to open the side panel', expect.any(Error));
  });
});
