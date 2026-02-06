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
- 3 sample programs

## Technical Details

### Memory Map:

- 64K of RAM (no ROM)
- To simplify, screen address is fixed at 60000, rows are full width, and there are no HALT bytes

### I/O Port Map:

- **Port 0:** Frame counter: increments each display refresh (~60Hz), useful for timing
- **Port 1:** Keyboard input: reads current key press
- **Port 2:** Beep frequency port: in units of 10Hz
- **Port 3:** Beep duration port: in milliseconds

## Usage

1. Open `simulator.html` directly in a web browser, or open `index.html` and click the simulator button
2. The **Default** performance test program loads automatically. To use something else:
   - Click **Clear** to write your own Z80 assembly code, or
   - Click **Basics** (register operations demo, starts halted) or **Space Invader** (playable micro-game)
3. Click "Assemble and Run" to compile and execute the code
4. Use "Break" to pause and switch to single-step mode
5. Use "Run" to resume continuous execution
6. Use "Fast" to disable screen updates for slightly better performance

### Making a beep sound

```assembly
LD A, 44          ; 440Hz (44 * 10Hz)
OUT (2), A        ; Set frequency
LD A, 100         ; 100ms duration
OUT (3), A        ; Set duration
```

A new sound plays on the next screen refresh. A new sound does not cancel other sounds being played.

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
- The emulator uses a long switch case statement. In the old days we exploited the patterns in the opcodes. For one, nobody had time for all this typing or RAM to hold it.
- Saving program to query params not implemented for file:// URLs.
- Saving program limited to 2000 characters even though more are possible

## Known Issues

- Performance varies significantly: 1 to 75 MIPS, not clear why; perhaps JIT, anti-virus, or browser extensions
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different preferences
- The UI could use a lot of fixing and polish. CSS is far more complex than Z80 Assembly. Testing UI across devices and modes is much harder than testing opcodes

## Easter Eggs/Hidden features

Since you got this far, might as well spoil the Easter eggs:

- **Character Set Verification:** Clicking the boot screen while the character set is rendering pauses the output.
- **Before you press "Assemble and Run":** Clicking on the simulated screen triggers a small grayscale animation, one-shotted by Claude
- **Space Invader Game:** If you press the **W** key during the game, your base becomes invisible so it cannot be hit by bombs

## About This Project

This project helped me explore how to work with today's AI coding tools. Sometimes brilliant - sometimes bad. It was a lot of fun.