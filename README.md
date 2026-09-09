# Sinclaude

A vanilla HTML/CSS/JavaScript Sinclair ZX81/Spectrum/Z80 emulator that runs entirely in the browser, co-written with Claude Opus 4 Aug 2025.

**Live at:** https://andyrosa.github.io/Sinclaude/simulator.html

**Repo:** https://github.com/andyrosa/Sinclaude

**This document with pictures:** https://andyrosa.github.io/Sinclaude/index.html

## Features

- Pretty good Z80 assembler
- Pretty fast CPU emulation
- Single-step and continuous execution modes
- Register, stack, and performance counter display
- ZX81-style screen buffer (32x24)
- Block characters and (Spectrum) lowercase characters
- Characters 128–255 render in inverted monochrome
- Configurable retro and traditional font styles
- Configurable mapping from on-screen buttons to keyboard keys
- Beep functionality (absent on real ZX81 and Spectrum)
- Share and save small programs using serverless URL
- Runs directly from the file system — no server or Node required
- For screens less than 768 pixels wide the UI hides less-relevant assembly buttons and auto-collapses sections in stepping mode
- 4 sample programs

## Technical Details

### Memory Map:

- 64K of RAM (no ROM)
- To simplify, screen address is fixed at 60000, rows are full width, and there are no HALT bytes

### I/O Port Map:

- **Port 0:** Frame counter: increments each display refresh (~60Hz), useful for timing
- **Port 1:** Keyboard input: reads current key press
- **Port 2:** Beep frequency port: in units of 10Hz
- **Port 3:** Exponential beep duration: `milliseconds = 4000^((byte-1)/254)` for codes 1-255. Zero means no request; 1 gives 1 ms and 255 gives 4 seconds.
- **Port 4:** Beep volume: 0 is silent, 255 is the former full level. Default 85 gives one-third of the former gain. Persists until changed; assembling a program or resetting restores 85.

## Usage

1. Open `simulator.html` directly in a web browser, or open `index.html` and click the simulator button
2. The **Default** performance test program loads automatically. To use something else:
   - Click **Clear** to write your own Z80 assembly code, or
   - Click **Basics** (register operations demo, starts halted), **Space Invader** (playable micro-game), or **Claudasaur** (first-person monster maze)
3. Click "Assemble and Run" to compile and execute the code
4. Use "Break" to pause and switch to single-step mode
5. Use "Run" to resume continuous execution
6. Use "Fast" to disable screen updates for slightly better performance

### Playing Claudasaur

Click **Load 'Claudasaur'**, then **Assemble and Run**. Move the pointer over the execution screen (or tap it) to activate keyboard capture, then press **Space** to start. Find the exit before the Claude-logo-inspired, spiky Claudasaur catches you.

- **W/S** or **Up/Down**: walk forward/backward. Hold to keep moving.
- **A/D** or **Left/Right**: turn a quarter turn per press.
- **Space**: toggle the live map; start again after escape or capture.
- **P**: pause/resume. The existing on-screen W/S/A/D/Space buttons also work.

The compass shows your facing direction. The map faces north: **@** is you, **\*** is Claudasaur, and **E** is the exit. The map does not pause the hunt. Claudasaur wakes after about six seconds and follows the shortest available path, moving more slowly than you. Each retry resets the same connected 16x16 maze so you can learn its routes.

The title screen plays a compact 6.2-second beep arrangement of the opening fanfare from Richard Strauss's [*Also sprach Zarathustra*, Op. 30](https://imslp.org/wiki/Also_sprach_Zarathustra,_Op.30_(Strauss,_Richard)): the rising C-G-C call, a crescendo, and low drum-like responses. Each trumpet note is a single sustained tone, using the nonlinear duration encoding. Pressing **Space** starts the game immediately and cancels the remaining queued music notes. During play, a low double heartbeat starts when Claudasaur is within six maze steps and doubles its pace within three. Capture plays four descending notes; escape plays a three-note rising chime. Pause stops new heartbeat notes, and retry cancels any remaining queued melody notes. Sounds advance alongside gameplay and remain active on the live map.

The game runs as Z80 assembly, including perspective drawing, keyboard input, pathfinding, and win/loss logic. JavaScript prepares the assembly source and drawing data. It uses the simulator's monochrome display, with a starburst creature inspired by the Claude logo.

Run its gameplay and rendering checks with `node run_claudasaur_tests_node.js`.

### Making a beep sound

```assembly
LD A, 85          ; One-third volume (0=mute, 255=full)
OUT (4), A        ; Set volume before requesting a beep
LD A, 44          ; 440Hz (44 * 10Hz)
OUT (2), A        ; Set frequency
LD A, 142         ; Approximately 100ms on the exponential scale
OUT (3), A        ; Request beep with encoded duration
```

The simulator starts a new sound after a CPU execution batch and clears ports 2 and 3. Port 4 retains its value. A new sound does not cancel other sounds being played; volume is captured independently for each note. Existing programs that only write ports 2 and 3 use the quieter default.

For nonzero codes, port 3 uses `t = k * a^byte`, with `a = 4000^(1/254)` and `k = 1/a` milliseconds. Each increment lengthens the note by about 3.32%, giving smooth proportional growth across the range. To encode 1-4000 ms, use `byte = 1 + round(254 * log(milliseconds) / log(4000))`. Code 0 is reserved for no request. For example:

| Duration byte | Requested duration |
| --- | --- |
| 1 | 1 ms |
| 22 | About 1.99 ms |
| 43 | About 3.94 ms |
| 128 | About 63.25 ms |
| 142 | About 99.90 ms |
| 200 | About 663.88 ms |
| 255 | 4 seconds |

`BEEP_DURATION_MIN_MS` and `BEEP_DURATION_MAX_MS` in `constants_and_css_vars.js` define the endpoints, and `BEEP_DURATION_RATIO` gives the multiplier between codes. The shared `encodeBeepDuration(ms)` and `decodeBeepDuration(byte)` helpers keep generated samples and playback consistent, with duration rounding within about 1.7%. The bundled samples have been converted; older saved assembly using raw milliseconds or the earlier quadratic scale needs its duration values re-encoded.

The direct JavaScript method still takes milliseconds: `playBeep(frequencyHz, durationMs, volume = 85)`. Claudasaur uses volume for the fanfare's crescendo and the gameplay sound effects, with every sound at or below 85. Run `node run_speaker_tests_node.js` to check duration and volume handling.

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

When you assemble a small program, the URL automatically updates to include the encoded program. With this URL you can:
- Bookmark URLs to save your programs
- Share the URL with others to share your program
- If the assembly program exceeds about 1K of text, it will not generate a URL because of limitations on URL size. A 16K RAM pack won’t fix this browser limitation.

### Assembler features

- Two-pass assembly process
- Z80 instructions supported include most variants of:
  - Load instructions (LD)
  - Arithmetic operations (ADD, SUB, INC, DEC)
  - Control flow (CALL, RET, JP, JR, DJNZ)
  - Logic operations (AND, OR, XOR, CP)
  - Stack operations (PUSH, POP)
  - Block operations (LDIR)
- Assembler directives (ORG, EQU, DB, DEFW, DEFS, END) (more than I ever had in the real device)
- Label support with arithmetic expressions
- Multiple number formats (decimal, hex, binary)
- String literals in data directives
- Error reporting with line numbers
- Machine code output with line numbers, decimal data, and checksums — perfect for magazine listings in 'Sinclair User' and 'Your Computer' before GitHub existed

## Emulator States
- App loads in the state "state_not_ready"
- If the URL contains an "asm" parameter, the app loads it as assembly code
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
- `z80_assembler.js`: Z80 assembly language parser and compiler
- `z80_cpu_emulator.js`: Z80 CPU instruction execution engine

### Sample Programs:
- `default_asm.js`: Performance benchmark program with hex counter
- `basics_asm.js`: Basic test program demonstrating register operations
- `space_invader_asm.js`: A lone 'Space Invader' game
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

The project runs two test suites:

### Z80 Assembler Tests (400+ tests)

Examples:
```javascript
//assembly, expected output
test("JP 1234H", [0xc3, 0x34, 0x12]);
test('DB "Hello"', [72, 101, 108, 108, 111]);
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
- No ROM emulation. Many rabbit holes avoided.
- "Fast" mode is only slightly faster than normal mode. That's good and bad
- It takes close to 100% of JavaScript's main thread. We are kinda going for performance. Once you program in ZX81 basic, you develop a need for speed
- The sample assembly programs are not optimized.
- The emulator decodes the regular opcode groups (register loads, INC/DEC, the 8-bit ALU and the CB prefix) from their bit fields, the way it was done in the old days when nobody had time for all that typing or RAM to hold it; the irregular opcodes are a switch statement.
- Saving program to query params not implemented for file:// URLs.
- Saving program limited to 2000 characters even though more are possible

## Known Issues

- Performance varies significantly: 1 to 75 MIPS, not clear why; perhaps JIT, anti-virus, or browser extensions
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different preferences
- The UI could use a lot of fixing and polish. CSS is far more complex than Z80 Assembly. Testing UI across devices and modes is much harder than testing opcodes

## Easter Eggs/Hidden features

Since you got this far, might as well spoil the Easter eggs:

- **Character Set Verification:** Clicking the boot screen while the character set is rendering pauses the output.
- **Space Invader Game:** If you press the **W** key during the game, your base becomes invisible so it cannot be hit by bombs

## About This Project

This project helped me explore how to work with today's AI coding tools. Sometimes brilliant - sometimes bad. It was a lot of fun.
