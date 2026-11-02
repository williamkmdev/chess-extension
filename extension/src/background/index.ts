// MV3 service worker. Opens the side panel when the toolbar icon is clicked.
// Screenshot capture will be added here in a later MVP step.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Failed to set side panel behavior', error);
  });
});
