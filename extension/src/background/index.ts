// MV3 service worker. Opens the side panel when the toolbar icon is clicked.
//
// The click is handled here (action.onClicked) instead of letting Chrome open the
// panel itself (openPanelOnActionClick): only a click that reaches the extension counts
// as invoking it, and that is what grants activeTab for the tab, which screenshot
// capture needs. Clicking the icon again (e.g. after the tab moved to another site)
// re-grants it.

chrome.runtime.onInstalled.addListener(() => {
  // An older version set this to true; with it on, onClicked never fires.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error: unknown) => {
    console.error('Failed to set side panel behavior', error);
  });
});

chrome.action.onClicked.addListener((tab) => {
  // Called straight away, while the click still counts as a user gesture.
  const target = tab.id !== undefined ? { tabId: tab.id } : { windowId: tab.windowId };
  chrome.sidePanel.open(target).catch((error: unknown) => {
    console.error('Failed to open the side panel', error);
  });
});

// A module (the manifest loads it as one), so tests can import it.
export {};
