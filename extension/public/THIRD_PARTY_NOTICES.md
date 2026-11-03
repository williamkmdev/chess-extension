# Third-party notices

Chess Video Position Explorer is free software, distributed under the GNU General Public
License, version 3 or (at your option) any later version. The full license text is in
`LICENSE`. Source code: https://github.com/williamkmdev/chess-extension

This extension bundles the following third-party material.

## Stockfish (chess engine)

- Authors: the Stockfish developers (see https://github.com/official-stockfish/Stockfish)
- WebAssembly build: stockfish.js 19.0.1 by Nathan Rugg, "lite single-threaded" flavor
  (https://github.com/nmrugg/stockfish.js)
- License: GNU General Public License, version 3. Full text in `engine/COPYING.txt`.
- Corresponding source: https://github.com/nmrugg/stockfish.js (build scripts and
  engine source for this version) and https://github.com/official-stockfish/Stockfish
- Files: `engine/stockfish-19-lite-single.js`, `engine/stockfish-19-lite-single.wasm`,
  used unmodified.

## cburnett chess pieces

- Author: Colin M.L. Burnett
- License: GNU General Public License, version 2 or (at your option) any later version,
  distributed here under version 3 (see `LICENSE`)
- Source: https://github.com/lichess-org/lila/tree/2e3e641c32b361c113e696cee34f9fddefef6727/public/piece/cburnett
- Used unmodified, embedded in the side panel's JavaScript bundle.

## chess.js

- License: BSD 2-Clause (text below)
- Source: https://github.com/jhlywa/chess.js

```
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## Preact

- License: MIT (text below)
- Source: https://github.com/preactjs/preact

```
The MIT License (MIT)

Copyright (c) 2015-present Jason Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
