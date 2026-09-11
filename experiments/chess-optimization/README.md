# 1.3K Chess optimization experiments

September 11, 2026. Input: the independent 1,236-byte implementation at
`ad4091b4fbcc9ff665fe192a52f2eb0f08727970`, not the removed 1K Chess port.

## Results

| Experiment | Code and data bytes | Result |
| --- | ---: | --- |
| Original assembly | 1,236 | Baseline tests pass |
| MDL pattern optimization | 1,236 | No savings |
| MDL code reorganization, inlining disabled | 1,236 | No savings |
| MDL search, two-instruction blocks | 1,226 | Passes; applied to `chess_asm.js` |
| Pattern pass after search | 1,226 | No further savings |
| LLVM C translation, `-Oz` | 3,034 | Excludes unresolved helpers; rejected |
| LLVM C translation, `-Os` | 3,453 | Excludes unresolved helpers; rejected |
| LLVM C translation, `-O2` | 5,058 | Excludes unresolved helpers; rejected |

MDL made 12 transformations with a net saving of 10 bytes. They reuse zeroed
registers after LDIR, reuse the board page when loading square addresses,
compare against an already loaded register, and simplify a bit-mask test.
The validated search result is byte-for-byte identical to the production code.
Its test workload fell from 6,197,376 to 6,074,612 instructions; maximum stack
usage remains 20 bytes. Rules, input, move ordering, and evaluation are unchanged.

The C file is an experimental translation of the current game, including UI,
special moves, and game-over handling. It uses the same fixed RAM workspace.
The LLVM measurements are **relocatable object sizes, not complete game sizes**:
frame/shift/flag helpers and the keyboard input routine remain unresolved.
Generated code uses IX/IY instructions unsupported by this simulator. The C
translation has not passed the simulator's behavioral tests and is not a
replacement for the assembly. Even its incomplete object is much larger.

WSL Ubuntu failed to start (`Wsl/Service/CreateInstance/E_FAIL`), so the compiler
experiment used the Windows CE toolchain's LLVM 19.1.0 Z80 target. This does not
measure the separate LLVM-Z80 23.1 release or every possible C formulation.

## Reproduce on Windows

Requires Python, Node, Java, and Git. Downloads and generated output stay in
ignored `tools/` and `out/`; scripts, C source, and reports are retained.

From the repository root:

```powershell
python experiments/chess-optimization/setup.py
node experiments/chess-optimization/prepare.cjs ad4091b
node experiments/chess-optimization/run-mdl.cjs pattern
node experiments/chess-optimization/run-mdl.cjs reorder
node experiments/chess-optimization/run-mdl.cjs search
node experiments/chess-optimization/verify.cjs experiments/chess-optimization/out/search.asm experiments/chess-optimization/out/search.bin
node experiments/chess-optimization/run-mdl.cjs pattern search
python experiments/chess-optimization/llvm-build.py
npm.cmd test
```

Preparation converts ZX81 character literals to numeric bytes and verifies that
the result assembles identically. Candidate validation uses the existing suite:
64 oracle positions, 1,335 legal moves, 117 keyboard turns, special moves,
positional decisions, illegal input, reset, display, and mate/stalemate.

Tools: [MDL 2.6.3](https://github.com/santiontanon/mdlz80optimizer/releases/tag/v2.6.3)
and [CE toolchain 15.0](https://github.com/CE-Programming/toolchain/releases/tag/v15.0).
Downloaded archive hashes are in `tools-manifest.json`.
