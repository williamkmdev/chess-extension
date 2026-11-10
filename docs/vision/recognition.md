# Piece recognition

Once the [locator](locator.md) has found the board, the extension reads the piece on
each square with a small CNN and loads the position into the editor.

## Flow

1. The board found (`Screenshot.board`) is resized and cut into 64 tiles
   (`vision/tiles.ts`).
2. The model classifies each tile (`panel/capture/recognize.ts`, ONNX Runtime Web).
3. The tiles are named as squares using the board's orientation on screen, which is the
   editor's **Flip board** state (`vision/classify.ts`).
4. The position replaces the editor's board automatically. The screenshot tools are
   only shown while setting up the position (they're hidden while exploring), so a
   reading still pending on Confirm position is dropped.

Only the pieces come from the screenshot. The side to move stays unknown, and castling,
en passant and the move counters are labeled defaults, as for any new draft. The user
confirms the position before it can be exported or analyzed.

**Orientation.** The model sees squares in screen order, so it can't tell White at the
bottom from Black at the bottom. If the editor's orientation doesn't match the
screenshot, the position looks right but lands on mirrored squares.

- While the loaded position is still unedited, **Flip board reads it again** from the
  other side. The picture still matches the screenshot, and the squares are corrected.
- After any edit, Flip board only turns the view, as before.

## Model contract

The model is a 61,069-parameter CNN (`CompactVGG`), trained outside this repository.
The extension relies on this contract, which matches the model's
`model_metadata.json`:

|         |                                                         |
| ------- | ------------------------------------------------------- |
| File    | `chess_tiles.onnx` (opset 17)                           |
| Input   | `tiles`, float32 `[N, 1, 32, 32]`                       |
| Output  | `probs`, float32 `[N, 13]`, softmax applied             |
| Classes | `1KQRBNPkqrbnp`: empty, then White's and Black's pieces |

**Preprocessing** is a port of `screenshot_tiles` in the training code
(`dataset_io.py`), which generated the training images. It must match exactly:

1. **Grayscale:** `0.299·R + 0.587·G + 0.114·B`, in float32. This is not the locator's
   Pillow grayscale.
2. **Resize the board to 256×256** with half-pixel bilinear sampling:
   - sample `i` is at `x0 + (i + 0.5)·w/256 − 0.5`, in pixel-centre coordinates;
   - the two neighbours on each axis are clamped to the whole screenshot (not to the
     board), and the weights are float64;
   - the result is rounded with `floor(v + 0.5)` to bytes.
3. **Cut into 8×8 tiles** of 32×32. There's no per-tile contrast normalization.
4. **Scale** the bytes by 1/255.

The board's corners are the located rect's pixel edges.

The Python takes tiles from A1 with White at the bottom. The extension instead keeps
them in screen order and names squares by orientation (`displayRows`), which gives the
same squares.

## Installing the model

The model is **not in the repository**. It was trained on piece sets that include
chess.com's, and whether weights trained on those images can be redistributed hasn't
been cleared. That has to be settled before any public release, as part of milestone
4's licensing review.

To use recognition locally:

1. Put `chess_tiles.onnx` (with `model_metadata.json` and `classes.json`, for the
   contract check) in `extension/models/`. That folder is gitignored.
2. Run `npm run build`. The model is copied to `dist/models/`. The build warns, and
   leaves it out, if it's missing.

Without the model, everything else works. After a board is found, the panel says
"Piece recognition isn't installed."

`test/model.contract.test.ts` runs when the model is present. It checks the metadata
against the contract above and runs the model once in ONNX Runtime Web. It doesn't
measure accuracy.

## Runtime

- **ONNX Runtime Web** (`onnxruntime-web`, MIT), WebAssembly execution provider, with
  one thread and SIMD.
  - The panel isn't cross-origin isolated, so threads aren't available anyway.
  - Its licence ships as `dist/licenses/onnxruntime-web.txt`. The package bundles a
    few small dependencies (protobufjs, flatbuffers, long and others), and their
    licences are part of the release licensing review.
- The runtime (a 15 MB `.wasm`, emitted by Vite as an asset) and the model are loaded
  on the first recognition and then reused.
- The extension's CSP already allows `'wasm-unsafe-eval'`, and nothing is fetched from
  the network.
- It runs on the panel's main thread, like the locator. Moving both to a worker belongs
  to milestone 4's performance work.

## Limits

- **Confidence isn't correctness.** Softmax probabilities are kept per square
  (`TileReading.confidence`), for highlighting uncertain squares later (milestone 4),
  but a confident reading can still be wrong.
- **Accuracy:** on the model's synthetic test set, tile accuracy is 99.36% and
  exact-board accuracy is 83.47%. The training and test sets share piece styles.
  Accuracy on real screenshots hasn't been measured here, so the user should always
  check the position.
- **Weak styles:** Lichess Firi, Horsey and XKCD; chess.com Sky and 8-bit.
- Anything the locator gets wrong (an off-by-one cell, the wrong board) gives a wrong
  position. Cropping around the board is the fix.
