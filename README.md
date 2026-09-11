# Sinclaude

A vanilla HTML/CSS/JavaScript Sinclair ZX81/Z80 emulator that runs entirely in the browser, co-written with Claude Opus 4.1 on launch date; updated with Fable 5.1 about a year later.

**Live at:** https://andyrosa.github.io/Sinclaude/simulator.html

**Repo:** https://github.com/andyrosa/Sinclaude

**This document with pictures:** https://andyrosa.github.io/Sinclaude/index.html

## Features

- Pretty good Z80 assembler
- Pretty fast CPU emulation
- Single-step and continuous execution modes
- Register, stack, and performance counter display
- Full size ZX-81 screen buffer (32x24)
- Original ZX81 character codes: graphics at 0–10, punctuation at 11–27, digits at 28–37, uppercase letters at 38–63
- Characters 128–191 render in inverted monochrome
- Configurable retro and traditional font styles
- Native phone keyboard input and five touch buttons for holding game controls
- Programmable beep frequency, duration, and volume
- Share and save small programs using serverless URL
- Runs directly from the file system — no server or Node required
- For screens less than 768 pixels wide the UI hides less-relevant assembly buttons and auto-collapses sections in stepping mode
- Six bundled sample programs

## Technical Details

### Memory Map:

- 64K of RAM (no ROM)
- To simplify, screen address is fixed at 60000, rows are full width, and there are no HALT bytes

### Character encoding

The screen, keyboard and assembler share the [ZX81 character set](https://worldofspectrum.net/ZX81BasicProgramming/appxa.html). Space is `0`, `0` is `28`, and `A` is `38`. Add `128` for an inverse character; solid black is `128`. Codes `64–127` and `192–255` are controls, BASIC tokens or unused values, and show an undefined-character marker when written directly to this fixed-cell screen. There is no BASIC token expansion.

Quoted assembly strings and character literals use ZX81 codes. Lowercase input becomes uppercase; unsupported punctuation produces an assembly error. Numeric data and `chr(n)` retain their byte values. The escapes `\n` and `\r` emit NEWLINE (`118`), and `\0` emits zero. Since zero is also space, use lengths or a separate terminator for text.

Programs using the previous ASCII encoding need their numeric text and key constants updated. For example, use `LD A,'A'` or `DB "HELLO"` instead of ASCII byte values. Saved source links reassemble with this encoding.

### I/O Port Map:

- **Port 0:** Frame counter: increments each display refresh (~60Hz), useful for timing
- **Port 1:** Keyboard input: reads the current key as its Sinclair character code, 255 when no key is down. Printable characters and named special keys are mapped separately. The most recently pressed key wins; releasing it restores any older key still held. Modifiers and function keys press nothing. The debug **Key** field shows the mapped Sinclair code.
- **Port 2:** Beep frequency port: in units of 10Hz
- **Port 3:** Exponential beep duration: `milliseconds = 4000^((byte-1)/254)` for codes 1-255. Zero means no request; 1 gives 1 ms and 255 gives 4 seconds.
- **Port 4:** Beep volume: 0 is silent, 255 is full volume. Default 85 is one-third volume. Persists until changed; assembling a program or resetting restores 85.
- **Port 5:** Queued keystrokes: each `IN A,(5)` consumes one press, in order, or returns 255 when empty. Reset, Assemble and Run, or releasing keyboard capture clears the queue.

Both keyboard ports use ZX81 character codes and uppercase letters. Arrow keys send `112` (up), `113` (down), `114` (left), and `115` (right); Enter sends `118` (NEWLINE), Backspace sends `119` (RUBOUT), and Escape sends `227` (STOP). Unsupported characters press nothing.

## Usage

1. Open `simulator.html` directly in a web browser, or open `index.html` and click the simulator button
2. The **Character Set Test** is the initial startup selection. The **On startup** menu setting can select another sample or a blank editor. To load a program:
   - Click **Clear** to write your own Z80 assembly code, or
   - Load **Debugger Test**, **Performance Test**, **Space Invader**, **Claudasaur**, or **1.3K Chess** using a load button or the program menu on a narrow screen.
3. Click "Assemble and Run" to compile and execute the code
4. Use "Break" to pause and switch to single-step mode
5. Use "Run" to resume continuous execution
6. Use "Fast" to disable screen updates for slightly better performance

Programs loaded from a URL assemble and start automatically. An ordinary visit loads the default program and waits for **Assemble and Run**.

If the browser blocks sound during automatic startup, the simulator waits before executing the first instruction and shows a prompt over the execution screen. Click, tap, or press a key to start with sound, or choose **Start muted**. Opening sounds play from the beginning, and that first interaction is not passed to the emulated keyboard. Muted playback lasts until the next Assemble and Run. When sound is already allowed, startup needs no prompt.

On touch devices, tap the **game screen** to open the phone's keyboard. Typed characters go straight to the running program, with autocorrection and spelling suggestions disabled. The **W S Space A D** buttons support holding keys for movement. Hover or focus the execution area to use a physical keyboard.

### Making a beep sound

```assembly
LD A, 85          ; One-third volume (0=mute, 255=full)
OUT (4), A        ; Set volume before requesting a beep
LD A, 44          ; 440Hz (44 * 10Hz)
OUT (2), A        ; Set frequency
LD A, 142         ; Approximately 100ms on the exponential scale
OUT (3), A        ; Request beep with encoded duration
```

The simulator starts a new sound after a CPU execution batch and clears ports 2 and 3. Port 4 retains its value. A new sound does not cancel other sounds being played; volume is captured independently for each note.

Switching away from the tab suspends audio; returning resumes it. Sound requests made while hidden are consumed without queuing notes for later playback.

### Delaying using the Frame Counter

```assembly
; Wait approximately 1/30ths of a second
WAIT_LOOP:
IN A, (0)         ; Read frame counter
CP 2              ; Wait for 2 frames
JR C, WAIT_LOOP   ; Continue waiting if less than 60
XOR A
OUT (0), A        ; Reset frame counter
```

This feature is useful for slowing down game loops.

### Saving Programs

Selecting a bundled sample creates a short `sample` link. Assembling edited or custom source saves the source in an `asm` link when it fits the URL size limit. If your edited program is too large to fit in the URL, it stays in the editor but is not saved in the link. The old program is removed from the URL, so refreshing will not reload that older version. With this URL you can:
- Bookmark URLs to save your programs
- Share the URL with others to share your program
- Opening or refreshing a shared URL loads and automatically starts its saved program, using the sound prompt described above when needed. Clicking **Clear** removes the program from the URL.
- If the assembly program exceeds about 1K of text, it will not generate a URL because of limitations on URL size. A 16K RAM pack won’t fix this browser limitation.

### Assembler features

- Two-pass assembly process
- Z80 instructions supported include most variants of:
  - Load instructions (LD)
  - Arithmetic operations (ADD, SUB, INC, DEC)
  - Control flow (CALL, RET, JP, JR, DJNZ)
  - Logic operations (AND, OR, XOR, CP)
  - Stack operations (PUSH, POP)
  - Block operations (LDIR, CPIR) and alternate-register exchange (EXX)
- Assembler directives (ORG, EQU, DB, DEFW, DEFS, END)
- Label support with arithmetic expressions
- Multiple number formats (decimal, hex, binary)
- String literals in data directives
- Error reporting with line numbers
- Addresses must be within 0–65535, and emitted bytes must fit within the 64K memory. Oversized allocations, malformed numbers, and trailing garbage are rejected before loading. `DB`/`DEFS` byte values accept -128–255; `DEFW` values accept -32768–65535.
- Machine code output with line numbers, decimal data, and checksums

## Emulator States
- App loads in the state "state_not_ready"
- If the URL contains saved "asm" source or a catalog selection ("sample" or "run"), the app loads it and starts through the audio gate
- If it does not, it loads the default assembly
- If the user clicks "Assemble and Run" and it succeeds:
  - the program counter is set to the lowest ORG (or 0 if none is used)
  - SP is set to 65535
  - Memory and registers are not cleared
  - The emulator state changes to "state_free_running"
- The buttons available in "state_free_running" are:
  - "Break": switches the state to "state_stepping"
  - "Reset": resets the program counter to the starting value
  - "Fast": disables screen rendering, making emulation a tiny bit faster
  - "Slow": re-enables screen rendering
- The buttons available in "state_stepping" are:
  - "Step": executes one instruction and stays in stepping mode
  - "Reset": resets the program counter as above
  - "Run": switches the state to "state_free_running"

## Project Files

### Core Interface:
- `simulator.html`: Main web interface with HTML structure and script loading
- `simulator.js`: Main simulator logic and controller

### Project Infrastructure:
- `boot.js`: Script loader and dependency manager — loads all JS files sequentially
- `ui.js`: User interface controls and event handling
- `scroll_target.js`: Scroll positioning and navigation utilities
- `styles.css`: CSS styling for the web interface
- `constants_and_css_vars.js`: Core configuration values and CSS variables
- `console-utils.js`: Logging infrastructure
- `clipboard-utils.js`: Clipboard functionality utilities
- `initialization.js`: Application startup handler — initializes the simulator after all scripts load
- `version.js`: Build version information
- `version_update.js`: Version management script

### Core Emulation:
- `zx81_charset.js`: Shared ZX81 display, keyboard and assembler text encoding
- `z80_assembler.js`: Z80 assembly language parser and compiler
- `z80_cpu_emulator.js`: Z80 CPU instruction execution engine

### Sample Programs:

- `sample_programs.js`: Sample catalog and initial startup selection
- `character_set_asm.js`: Character Set Test, displaying all 256 codes plus rows 18–23 with solid fill, stippling, and joined quarter-block tiles. Use **Retro Fonts** to inspect graphics alignment.
- `default_asm.js`: Performance benchmark program with hex counter
- `basics_asm.js`: Basic test program demonstrating register operations
- `space_invader_asm.js`: A lone 'Space Invader' game
- `chess_asm.js`: 1.3K Chess, a native Z80 game with castling, en passant and promotion
- `claudasaur_asm.js`: First-person maze game with a pursuing starburst monster

### Testing:
- `tester.js`: Testing framework and utilities
- `z80_assembler_test.js`: Comprehensive assembler test suite (400+ tests)
- `z80_cpu_emulator_test_runner.js`: Z80 CPU emulator test suite runner (700+ tests)
- `z80_cpu_emulator_test_cases.js`: Additional CPU emulator test cases

### Development:
- `agent.md`: Development guidelines and rules for AI-assisted coding

### Documentation:
- `index.html`: A retro landing page that includes this document
- `README.md`: This documentation (also listed under Core Interface)
- `Assembly Button Visibility Flow.md`: UI behavior documentation

### Graphic Assets:
- `desktop_screenshot.PNG`, `phone_screenshot_top.PNG`, `phone_screenshot_bottom.PNG`: UI screenshots
- `magazine_ad.png`: OG ad

## Build System

The build process automatically updates `version.js` with current build information including timestamp, commit hash, and branch. `version-update.js` monitors `version.js` every few seconds and offers users the option to refresh if a new version is detected, enabling quick feedback during development.

## Testing

Examples from the assembler and CPU test suites:

### Z80 Assembler Tests (400+ tests)

Examples:
```javascript
//assembly, expected output
test("JP 1234H", [0xc3, 0x34, 0x12]);
test('DB "Hello"', [45, 42, 49, 49, 52]);
```

### Z80 Emulator Tests (700+ tests)

Examples:
```javascript
//assembly, expected CPU post-conditions
test("JP 1234H", "pc=0x1234");
test("LD BC, 1234H\nLD A, 0FFH\nLD (BC), A",
     "a=0xFF, b=0x12, c=0x34, [0x1234]=0xFF");
test("XOR A", "carry=false, zero=false, a=0x00");
test("CCF", "carry=flip");
```

**Available post-conditions:** A,B,C,D,E,H,L registers, PC, SP, zero and carry flags, CPU halted state, memory content, I/O ports

## Current Limitations

- Only the C and Z flags are implemented
- Registers IX, IY and R not implemented
- Many IN/OUT/CP/Rotate instructions not implemented
- No interrupts (IM/EI/DI/RST, hardware NMI even though it would be fun and useful)
- No ROM emulation.
- "Fast" mode is only slightly faster than normal mode. That's good and bad
- Emulation can occupy most of the browser's main thread.
- Saving program to query params not implemented for file:// URLs.
- Saving program limited to 2000 characters even though more are possible

## Known Issues

- Performance varies significantly: 1 to 75 MIPS, not clear why; perhaps JIT, anti-virus, or browser extensions
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different preferences
- The UI could use a lot of fixing and polish. CSS is far more complex than Z80 Assembly. Testing UI across devices and modes is much harder than testing opcodes

## Games

### Space Invader

[Space Invader](simulator.html?sample=spaceInvader).

### Claudasaur

[Claudasaur](simulator.html?sample=claudasaur).

### 1.3K Chess

Inspired by David Horne's ["Full ZX-81 Chess in 1K," *Your Computer*, February 1983](https://users.ox.ac.uk/~uzdm0006/scans/1kchess/). **1,234 bytes** of Z80 code and data.

Play Black by typing a move such as `E7E5`. Press **Escape** to clear the current move entry or cancel a pending promotion choice.

Adds: castling, en passant, promotion, and checkmate and stalemate detection. Missing: repetition, 50-move rule, and insufficient-material detection.

[1.3K Chess](simulator.html?sample=chess).

## About This Project

This project helped me explore how to work with today's (mid 2025) AI coding tools. Sometimes brilliant - sometimes bad. It was a lot of fun.

## License

Project code is released under the [Unlicense](LICENSE).

