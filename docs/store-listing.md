# Chrome Web Store listing

The text and assets for the store's Developer Dashboard, ready to paste. Keep this in
step with what the extension actually does: the store reviews the listing against it.

## Package

1. Set `version` in `extension/public/manifest.json` (and `package.json`). Each upload
   must have a higher version than the last; `0.1.0` is a sensible first one.
2. `npm run build` in `extension/`.
3. Zip the **contents** of `extension/dist/`, so `manifest.json` is at the zip's root.
4. Unzip it somewhere else and load that folder unpacked in a clean Chrome profile, then
   run through the smoke test below before uploading.

## Store listing tab

**Name** (from the manifest, ≤ 75 characters): Chess Video Position Explorer

**Summary** (the manifest's `description`, ≤ 132 characters):

> Screenshot any chess board, then explore it: try your own moves, branch into variations, and play against Stockfish. All local.

**Category:** Education

**Language:** English

**Detailed description:**

```text
Ever watch a chess game and wonder why they played that move, or why the move you had in mind wouldn't work? The best way to find out is to try it yourself.

Chess Position Explorer turns any chess board on your screen into a position you can explore. Screenshot a video, a website, an article or a puzzle, and the board is read into an editor in seconds. From there, test your own ideas until your question is answered, instead of skipping it because it's too tedious to set up.

EXPLORE IN BRANCHES, NOT JUST ONE LINE
Found two moves that both look good? Wondering why Stockfish played one move and not another? Try them all. Every idea becomes its own branch, and the extension keeps track of every branch and position for you. Keep as many variations as you like, switch between them in one click, and make any of them the main line. You spend your time thinking about chess, not managing the board.

PLAY IT YOUR WAY
• Play both sides yourself, to test your own reasoning.
• Play against Stockfish, to see how a strong engine punishes or answers your idea.
• Or mix the two: switch between playing yourself and playing Stockfish at any point, in any branch.
Stockfish analyses every position as you go, compares your move with its own choice, and shows you its best line.

HOW IT WORKS
1. Click the toolbar icon to open the side panel, then click Capture tab.
2. The board is found and the pieces are read. If there's more than one board, crop around the one you want.
3. Check the position and choose whose turn it is (a screenshot can't show that), then confirm.
4. Explore.
You can also set up a position by hand or paste a FEN, and copy the FEN of any position.

SIMPLE, LIGHTWEIGHT, PRIVATE
A small side panel with simple controls, built around one goal: helping you learn by experimenting. Everything runs in your browser, including board detection, piece recognition and the Stockfish engine. Nothing is uploaded and nothing is tracked, and the extension only sees a tab when you click its icon and capture it.

GOOD TO KNOW
• Works best with a clear, fully visible board. Always check the recognized position before confirming, since unusual piece styles can be misread.
• Castling rights and en passant can't be seen in a screenshot either: they're filled in as labelled, editable defaults.

Free and open source (GPL-3.0): https://github.com/williamkmdev/chess-extension
```

**Icon:** `extension/public/icons/icon128.png` (128×128, artwork 96×96 with transparent
padding, as the store asks).

**Screenshots** (1280×800, PNG or JPEG, 1 to 5). Suggested set, in order:

1. A board found and outlined on a capture, with the position loaded in the editor below.
2. The editor: Side to move, Confirm position, and the labelled assumed fields.
3. Exploring: a candidate move played, with the "Compared with Stockfish" card.
4. The engine analysis card with its line, and the move list with a variation.
5. Playing against Stockfish.

To make them: give the side panel a fixed width, and take the tab plus panel at
1280×800 (Chrome DevTools' device toolbar or a window-sizing extension helps). Only use
content you have the right to show: a board you set up yourself on Lichess, or your own
video. **No frames from other people's videos**, and keep the screenshots out of the
repository.

**Small promo tile** (440×280): the icon at about 120 px on the left, the name on the
right, and a short line such as "Why didn't they play this move?". Same dark green
(`#26322b`) background as the icon.

**Marquee tile** (1400×560): optional; only used if the store features the extension.

**Promo video:** a YouTube URL (public or unlisted); see the script below.

## Privacy tab

**Single purpose:**

> Lets the user capture a chess position from the current tab and analyze it with a chess engine that runs locally.

**Permission justifications:**

- `activeTab`: "Takes a screenshot of the current tab when the user clicks Capture tab,
  so the chess position on it can be read. Access is granted only by clicking the
  extension's icon, for that tab."
- `sidePanel`: "The extension's interface (screenshot, board editor and analysis) is a
  side panel next to the page."

**Remote code:** No. All code, the engine and the model are in the package. (The
manifest's `'wasm-unsafe-eval'` is needed to run the bundled WebAssembly.)

**Data usage:** the extension processes the screenshot of a tab (website content) on the
device and transmits nothing. If the dashboard asks what is collected, the honest answer
is that nothing leaves the device. Then tick the three certifications: no selling or
transfer of data, no unrelated use, no creditworthiness use.

**Privacy policy URL:** recommended even so, to avoid a rejection; a short page in the
repository works. It should say:

- what the extension accesses: a screenshot of the current tab, on request;
- that it's processed in the browser and kept only in the open panel;
- that nothing is sent, stored on a server or shared;
- that there are no analytics.

## Promo video script (about 50 seconds)

Record at 1280×720 or higher, with the side panel open, on a board you set up yourself.
No narration needed; short captions are enough. Upload to YouTube and paste the link.

| Time    | Shot                                                                  | Caption                                     |
| ------- | --------------------------------------------------------------------- | ------------------------------------------- |
| 0–5 s   | A chess position on screen, as if paused in a video                   | "Why didn't they play this move?"           |
| 5–10 s  | Click the toolbar icon; the side panel opens. Click **Capture tab**   | "Capture the position"                      |
| 10–17 s | The board outline appears; the position fills the editor              | "The board and pieces are read for you"     |
| 17–24 s | Choose the side to move; click **Confirm position**                   | "Check it, and choose whose turn it is"     |
| 24–34 s | Drag your candidate move; the comparison and Stockfish's reply appear | "Try your move. See Stockfish's answer"     |
| 34–44 s | Step through the line; branch into a variation in the move list       | "Step through the line, explore variations" |
| 44–50 s | The icon and name                                                     | "Runs locally. Free and open source."       |

## Smoke test before uploading

On the zip you're about to upload, loaded unpacked in a clean profile:

1. The toolbar shows the icon, and clicking it opens the side panel.
2. Capture a tab with a board: it's outlined, and the position loads.
3. Choose the side to move, then Confirm position: analysis starts.
4. Play a move: the comparison card and Stockfish's reply appear.
5. Copy the FEN, then use New position and check the screenshot is back.
