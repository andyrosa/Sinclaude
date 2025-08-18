# Sinclaude

A vanilla HTML/CSS/JavaScript Sinclair ZX81/Spectrum/Z80 emulator that runs entirely in the browser, co-written with Claude

**Live at:** https://andyrosa.github.io/Sinclaude/simulator.html

**Repo:** https://github.com/andyrosa/Sinclaude

**This document with pictures:** https://andyrosa.github.io/Sinclaude/index.html

## Features

- Pretty good Z80 assembler
- Pretty fast CPU emulation 
- Single-step and continuous execution modes
- Register, stack, and performance counter display
- ZX81-style screen buffer (32x24) with block characters and (Spectrum) lowercase characters
- Character codes 128-255 display inverted monochrome 'colors' 
- Configurable retro vs traditional fonts
- Customizable button press to keyboard key mapping
- Beep functionality (not available on ZX81 or Spectrum)
- Share and save small programs using serverless URL
- Can run from the file system (no backend/server/node needed)
- Extensive built-in assembler and simulator tests
- Narrow viewport (≤768px) hides less-context-relevant assembly-area buttons and auto-collapses sections in stepping mode

## Technical Details

### Memory Map:
- 64K of RAM (no ROM)
- To simplify, screen address is fixed at 60000, rows are full width, and there are no HALT bytes.

### I/O Port Map:
- **Port 0:** Frame counter: increments each display refresh (~60Hz), useful for timing
- **Port 1:** Keyboard input: reads current key press
- **Port 2:** Beep frequency port: in units of 10Hz
- **Port 3:** Beep duration port: in milliseconds

## Usage

1. Open `index.html` in a web browser and click the button to open the simulator, or open `simulator.html` directly. Both can be run directly from disk, without a web server.
2. Type Z80 assembly code in the input area, or click a sample program button:
   - **Benchmark:** Performance test showing an incrementing counter
   - **Basic:** Simple test program with register operations (starts halted for stepping)
   - **Space Invader:** Playable game
3. Click "Assemble and Run" to compile and execute the code (screen clears automatically)
4. Use "Break" to switch to single instruction execution
5. Use "Fast" to disable screen rendering for slightly better performance

### Making a beep sound

```assembly
LD A, 44          ; 440Hz (44 * 10Hz)
OUT (2), A        ; Set frequency
LD A, 100         ; 100ms duration
OUT (3), A        ; Set duration.
```
A new sound plays on the next screen refresh. A new sound does not cancel other sounds being played.

### Timing with Frame Counter

```assembly
; Wait approximately 1 second (60 frames at 60Hz)
LD A, 0
OUT (0), A        ; Reset frame counter
WAIT_LOOP:
IN A, (0)         ; Read frame counter
CP 60             ; Wait for 60 frames
JR C, WAIT_LOOP   ; Continue waiting if less than 60
```
This feature is useful for slowing down game loops.

### Saving Programs

When you assemble a program, the URL automatically updates to include the encoded program. With this URL you can:
- Bookmark URLs to save your programs
- Share the URL with others to share your program
- If the assembly program exceeds about 1K of text, it will not generate a URL because of limitations on URL size. 16K of RAM won’t help with this limitation.

### Assembler features
- Two-pass assembly process.
- Z80 instructions supported include most variants of:
  - Load instructions (LD) with immediate values and register transfers
  - Arithmetic operations (ADD, SUB, INC, DEC)
  - Control flow (CALL, RET, JP, JR, DJNZ) with conditional variants
  - Logic operations (AND, OR, XOR, CP)
  - Stack operations (PUSH, POP)
  - Block operations (LDIR)
- Assembler directives (ORG, EQU, DB, DEFW, DEFS, END) (more than I ever had)
- Label support with arithmetic expressions
- Multiple number formats (decimal, hex, binary)
- String literals in data directives
- Error reporting with line numbers
- Machine code output that includes line numbers, decimal data, and checksums, perfect for sharing in magazine articles in publications like 'Sinclair User' and 'Your Computer' before GitHub was invented

## Application States
- App loads in the state "state_not_ready".
- If app detects an "asm" param in the URL, it converts its value into an assembly listing.
- If it does not, it loads the default assembly.
- If the user clicks "Assemble and Run" and it succeeds:
  - the program counter is set to the lowest ORG (or 0)
  - SP is set to 65535
  - Memory and registers are not cleared
  - The state changes to state_free_running
- The buttons available in state_free_running are:
  - "Break": switches the state to state_stepping
  - "Reset": resets the program counter to the starting value
  - "Fast": disables screen rendering, making emulation a tiny bit faster
  - "Slow": re-enables screen rendering
- The buttons available in state_stepping are:
  - "Step": executes one instruction and stays in stepping mode
  - "Reset": resets the program counter as above
  - "Run": switches the state to state_free_running

## Project Files

### Core Interface:
- `index.html`: A retro landing page that includes this document
- `README.md`: This documentation
- `simulator.html`: Main web interface with HTML structure and script loading
- `simulator.js`: Main simulator logic and controller

### Project Infrastructure:
- `boot.js`: Application initialization and module loading
- `ui.js`: User interface controls and event handling
- `scroll_target.js`: Scroll positioning and navigation utilities
- `styles.css`: CSS styling for the web interface
- `constants_and_css_vars.js`: Core configuration values and CSS variables
- `console-utils.js`: Logging infrastructure
- `clipboard-utils.js`: Clipboard functionality utilities
- `initialization.js`: Application bootstrap and setup
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
- `z80_cpu_emulator_test.js`: Z80 CPU emulator test suite (700+ tests)
- `z80_cpu_emulator_tests.js`: Additional CPU emulator test cases

### Development:
- `agent.md`: Development guidelines and rules for AI-assisted coding

### Documentation:
- `README.md`: This documentation (also listed under Core Interface)
- `Assembly Button Visibility Flow.md`: UI behavior documentation

### Graphic Assets:
- `desktop_screenshot.PNG`, `phone_screenshot_top.PNG`, `phone_screenshot_bottom.PNG`: UI screenshots
- `magazine_ad.png`: OG ad

## Build System

The build process automatically updates `version.js` with current build information including timestamp, commit hash, and branch. The running application monitors `version.js` every few seconds and offers users the option to refresh if a new version is detected, enabling seamless updates during development.

## Testing

The project runs two test suites:

### Z80 Assembler Tests (400+ tests)
Example of a test:
```javascript
//assembly, expected output
test("JP 1234H", [0xc3, 0x34, 0x12]);
```

### Z80 Emulator Tests (700+ tests)  
Example of a test:
```javascript
//assembly, expected post-conditions
test("JP 1234H", "pc=0x1234");
```
**Verified post-conditions:** A,B,C,D,E,H,L registers, PC, SP, zero and carry flags, CPU halted state, memory content, I/O ports

## Current Limitations

- Many Z80 instructions not implemented (for instance LD B, C might exist, but not LD C, B)
- Minimal flag handling - just C and Z
- R register not simulated or tested
- No ROM emulation. Many rabbit holes avoided. I saw again why many of us love writing simulators/emulators/game engines
- "Fast" mode is only slightly faster than normal mode. That's good and bad
- It takes close to 100% of JavaScript's main thread. We are kinda going for performance. Once you program in ZX81 basic, you have a need for speed
- The sample assembly programs are not optimized.
- The emulator uses a long switch case statement. In the old days we exploited the patterns in the opcodes

## Known Issues
- Performance varies significantly: 1 to 50 MIPS, not clear why.
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different preferences.
- UI could use a lot of fixing and polish. CSS is far more complex than Z80 Assembly. Testing UI across devices is much harder than testing opcodes.
  
## Easter Eggs

Since you got this far, might as well spoil the Easter eggs:

- **Before you press "Assemble and Run":** Clicking on the simulated screen triggers a small grayscale animation.
- **Space Invader Game:** If you press the **W** key during the game, your base becomes invisible so it cannot be hit by bombs.

## About This Project

This project helped me explore how to work with today's AI coding tools. Sometimes brilliant - sometimes bad. It was a lot of fun.