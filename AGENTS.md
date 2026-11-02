# Chess Video Position Explorer — Shared Project Instructions

## Product goal
Build an open-source Chrome extension that answers: "Why didn't the player make *this* move?"
The user captures a chess position from a video or other visible tab, confirms/corrects it, tries a candidate move, and steps through the engine's best response. The extension also supports copying/exporting FEN for use elsewhere.

Priorities: a useful interactive learning tool, local-first privacy, maintainability, reproducible tests, and a credible public GitHub portfolio project. Avoid features that don't serve this goal.

## Proposed architecture (adapt as the repository evolves)
- `extension/`: TypeScript, Chrome Manifest V3, side panel; use Vite or an equivalent build tool if appropriate.
- `extension/src/background/`: user-triggered visible-tab screenshot capture and extension messaging. Limit permissions to what is needed.
- `extension/src/vision/locate.ts`: browser-independent board localization, returning a square bounding box or failure. Provide manual cropping as fallback.
- `extension/src/vision/classify.ts`: later, segment a detected board into 64 tiles and return per-square piece predictions and confidence.
- `extension/src/panel/editor/`: editable board, orientation, side to move, castling/en-passant inputs, position confirmation, and FEN import/export.
- `extension/src/engine/`: local Stockfish WASM in a Web Worker behind a typed API. Contain UCI protocol parsing here, not in UI components.
- `extension/src/panel/analysis/`: move exploration, principal variations, scores, engine replies, step-by-step playback, and move-tree navigation.
- `extension/src/shared/`: message contracts, position types, chess move/evaluation types, and other stable boundaries.
- `training/`: later, reproducible synthetic-data generation, model training, evaluation, and optional ONNX export.
- `docs/`: architecture decisions, known limitations, model/vision evaluation, and licensing decisions.

These paths and dependencies are *proposals*, not an excuse to create unused infrastructure in advance. Keep major interfaces testable and independent of Chrome APIs where feasible.

## Chess correctness: non-negotiable
- FEN is the interoperable **position notation**, not a hash. Support copying a FEN string and opening it in a chess-analysis site.
- A screenshot cannot reliably reveal side to move, historical castling rights, en-passant availability, or the halfmove/fullmove counters. Do not present guesses as facts. Provide editable defaults and clearly label uncertain metadata.
- The starting locations of kings and rooks do **not** prove castling rights. A board's visual orientation is UI state, not part of FEN.
- Maintain a draft-position representation with recognition confidence and unknown metadata as needed; convert to FEN only once the user has confirmed required fields. Validate the resulting position before engine analysis, and give actionable errors.
- A still screenshot does **not** reveal what the GM actually played next. Compare against the real game move only when the user supplies it or an independently verified move is available. Otherwise compare against Stockfish's recommended move and label that distinction.
- Use consistent evaluation perspective and units when comparing candidate moves, engine replies, and baseline lines; distinguish centipawn scores from mate scores.
- Support legal move entry and a navigable variation tree. Prevent stale worker results from replacing analysis for a newer position. Allow cancellation or interruption of engine search.

## Privacy, security, and licensing
- Keep screenshots and analysis local by default; no silent uploads, telemetry, or automatic capture. Network-backed enhancements require a deliberate product decision and clear disclosure.
- Prefer `activeTab` and other narrowly scoped permissions. Keep Chrome MV3 CSP, worker, WASM, and packaging constraints in mind; bundle runtime code rather than remotely executing it.
- Check the license and redistribution obligations of every bundled engine, board UI, chess piece set, and training asset before release. Stockfish and common browser builds are GPL-3 licensed: retain license notices and comply with source-distribution requirements. Do not assume the extension's final licensing decision without reviewing the dependency combination.
- Keep screenshots and training fixtures legally usable for public distribution; do not add third-party video frames to the public repo without permission or an appropriate basis.

## Delivery milestones (in order)
1. **Useful MVP:** user-triggered screenshot/crop as a visual reference; manual position setup or FEN import; chessboard editor; FEN export; local Stockfish WASM analysis; candidate-move exploration and move-by-move reply. The screenshot does not yet need to generate a position automatically.
2. **Board localization:** automatic square-board detection with manual crop fallback, coordinate/orientation handling, and screenshot fixtures.
3. **Piece recognition:** 13 classes (12 pieces plus empty), confidence-guided corrections, synthetic training pipeline, and real-screenshot evaluation. Choose the inference runtime after benchmarking rather than treating ONNX as mandatory.
4. **Polish and publication:** keyboard shortcut, better orientation hints, errors/accessibility, performance, documentation, CI, demo media, and Chrome Web Store preparation.

Do not start a later milestone merely because its directory is listed here.

## Engineering and testing expectations
- TypeScript types at module boundaries; small, independently testable modules; no Chrome globals inside pure vision/chess algorithms.
- Use established chess move/position utilities rather than hand-writing legality rules.
- Test FEN import/export, orientation, castling/en-passant edge cases, engine protocol and cancellation, rapid position changes, and capture/crop coordinate handling.
- For vision, keep a versioned, reproducible fixture set and report both detection accuracy and failure cases. Include highlights, arrows, scaling, compression, overlays, and unusual board themes.
- For the training pipeline, record dataset generation inputs, seeds, class balance, held-out real screenshots, model versions, and accuracy by class/theme. Avoid claiming accuracy without measured evidence.
- Add linting, formatting, typecheck, tests, and a production extension build to CI as the implementation matures. Don't invent commands; read the actual package/project scripts.
- Keep changes scoped and reviewable. Document important tradeoffs briefly in `docs/`. Prefer clear conventional commit suggestions, but do not make commits or push without user approval.

## Code review priorities
Look for concrete correctness bugs and regressions first: FEN metadata assumptions, illegal or mislabeled lines, evaluation sign/perspective errors, async worker races, MV3/CSP issues, coordinate transforms, privacy leaks, licensing problems, and untested failure paths. Give file/line references and a practical fix. Avoid low-value style nitpicks already covered by tooling.
