# Privacy policy

_Chess Video Position Explorer, a Chrome extension. Last updated: 21 November 2026._

**In short: the extension collects nothing. Everything it does happens on your
computer, and nothing is sent anywhere.**

## What the extension accesses

- **A screenshot of the current tab, only when you ask.** When you click **Capture tab**
  in the side panel, the extension takes one screenshot of the visible part of that tab,
  so it can find the chess board on it and read the pieces. It can't see the tab at any
  other time, and it can't see your other tabs. (Chrome grants this through the
  `activeTab` permission, which only applies after you open the extension on a tab.)
- **Your clipboard, only when you click Copy next to a FEN.** The extension writes the position's
  FEN to the clipboard. It never reads the clipboard.

## What happens to it

- The screenshot is processed **in your browser**: finding the board, reading the
  pieces with a small neural network, and analysing positions with the Stockfish chess
  engine all run locally, using code and files bundled with the extension.
- The screenshot and the positions you explore are kept **only in the open side panel's
  memory**. They aren't saved to disk or to browser storage, and they're gone when you
  close the panel.
- **Nothing is sent** to us or to anyone else. The extension makes no network requests
  except to load its own bundled files, has no server, and contains no analytics,
  tracking or advertising.

## Data shared or sold

None. Since no data leaves your device, none is shared, sold, or used for any other
purpose.

## Changes

If the extension ever changes how it handles data, this page will be updated first, and
any feature that sends data off your device would be opt-in and clearly disclosed.

## Contact

Questions: open an issue at
<https://github.com/williamkmdev/chess-extension/issues>.
