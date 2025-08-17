# Sinclaude

A vanilla HTML/CSS/JavaScript Sinclair ZX81/Spectrum/Z80 emulator that runs entirely in the browser, co-written with Claude.

**Live at:** https://andyrosa.github.io/Sinclaude/simulator.html

**Repo:** https://github.com/andyrosa/Sinclaude

**This document with pictures:** https://andyrosa.github.io/Sinclaude/index.html

## Features

- Pretty good Z80 assembler
- Pretty fast CPU emulation with register and stack display
- Single-step and continuous execution modes
- Performance counters
- ZX81-style display (32x24) with block characters and Spectrum lowercase characters
- Character codes 128-255 display with inverted colors
- Menu-configurable retro vs traditional fonts
- Customizable button press to keyboard key injection 
- Beep functionality (not available on ZX81 or Spectrum)
- Share and save small programs using serverless URL
- Can run from the file system (no backend/server/node needed)
- Extensive built-in assembler and simulator tests
- Narrow viewports (≤768px) hides less-context-relevant assembly-area buttons and auto-collapses sections in stepping mode
- Touch devices show touch hints and use touch-based keyboard capture instead of hover detection

## Technical Details

### Memory Map:
- 64K of RAM
- To simplify, screen address is fixed at 60000, rows are full width, and there are no HALT bytes.

### I/O Port Map:
- **Port 0:** Frame counter: increments each display refresh (~60Hz), useful for timing
- **Port 1:** Keyboard input: reads current key press
- **Port 2:** Beep frequency port: in units of 10Hz
- **Port 3:** Beep duration port: in milliseconds

## State
- Web page loads in the state "state_not_ready" - trying to run or step shows a warning.
- If it detects an "asm" param in the URL, it converts its value into an assembly listing.
- If it does not, it loads the benchmark assembly by default, which displays a performance counter.
- The user clicks "Assemble and Run" to clear screen, compile and execute code.
- Whenever "Assemble" succeeds, the state changes to state_free_running.
- Whenever the state changes to state_free_running, the assembled program is started.
- Before the program starts, the program counter and stack pointer are set. Memory and registers are not cleared.
- The buttons available in state_free_running are:
  - "Break": switches the state to state_stepping
  - "Reset": resets the program counter
  - "Fast": disables screen rendering, making emulation a tiny bit faster
  - "Slow": re-enables screen rendering
- The buttons available in state_stepping are:
  - "Step": executes one instruction and stays in stepping mode
  - "Reset": resets the program counter
  - "Run": switches the state to state_free_running

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

A new sound plays on the next screen refresh. A new sound does not cancel other sounds being played.

```assembly
LD A, 44          ; 440Hz (44 * 10Hz)
OUT (2), A        ; Set frequency
LD A, 100         ; 100ms duration
OUT (3), A        ; Set duration.
```

### Timing with Frame Counter
Use port 0 for approximate timing:

```assembly
; Wait approximately 1 second (60 frames at 60Hz)
LD A, 0
OUT (0), A        ; Reset frame counter
WAIT_LOOP:
IN A, (0)         ; Read frame counter
CP 60             ; Wait for 60 frames
JR C, WAIT_LOOP   ; Continue waiting if less than 60
```

### Saving Programs

When you assemble a program, the URL automatically updates to include the encoded program. With this URL you can:
- Bookmark URLs to save your programs
- Share the URL with others to share your program
- If the assembly program exceeds 1K of text, it will not generate a URL because of limitations on URL size. 16K of RAM won’t help with this limitation.

### Assembler features
- Two-pass assembly process.
- Z80 instructions supported including most versions of:
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

## Code Architecture

## Project Files

### Core Interface:
- `index.html`: A retro landing page that includes this document
- `README.md`: This documentation
- `simulator.html`: Main web interface with HTML structure and script loading

### Sample Programs:
- `default_asm.js`: Performance benchmark program with hex counter
- `basics_asm.js`: Basic test program demonstrating register operations
- `space_invader_asm.js`: Space Invader game implementation

### Project Infrastructure:
- `boot.js`: Application initialization and module loading
- `ui.js`: User interface controls and event handling
- `scroll_target.js`: Scroll positioning and navigation utilities
- `styles.css`: CSS styling for the web interface
- `constants_and_css_vars.js`: Core configuration values and CSS variables
- `console-utils.js`: Logging infrastructure
- `initialization.js`: Application bootstrap and setup

### Testing:
- `z80_assembler_test.js`: Comprehensive assembler test suite (200+ tests)
- `z80_cpu_emulator_test.js`: Z80 CPU emulator test suite (500+ tests)

### Documentation and Assets:
- `Assembly Button Visibility Flow.md`: UI behavior documentation
- `z80_opcodes_ref.txt`: Z80 instruction reference
- `desktop_screenshot.PNG`, `phone_screenshot_top.PNG`, `phone_screenshot_bottom.PNG`: UI screenshots
- `magazine_ad.png`: Retro-style promotional image

## Testing

The project includes two test suites to reduce bugs:
Example of a test:
### Assembler Tests (200+ tests)
```javascript
//assembly, expected output
test("JP 1234H", [0xc3, 0x34, 0x12]);
```

### Z80 Emulator Tests (500+ tests)  
Example of a test
```javascript
//assembly, expected post-conditions
test("JP 1234H", "pc=0x1234");
```
**Verified post-conditions:** A,B,C,D,E,H,L registers, PC, SP, zero and carry flags, CPU halted state, memory content, I/O ports

## Current Limitations

- Many Z80 instructions not implemented (for instance LD B, C might exist, but not LD C, B)
- The emulator uses a long switch case statement. In the old days we exploited the patterns in the opcodes
- Minimal flag handling - primarily the easy to remember flags: C and Z
- R register not simulated or tested
- No ROM emulation. Many rabbit holes avoided. I saw again why many of us love writing simulators/emulators/game engines
- "Fast" mode is only slightly faster than normal mode. That's good and bad
- It takes close to 100% of JavaScript's main thread. We are going for raw performance

## Known Issues
- Performance varies significantly: 90 MIPS on a phone, sometimes as low as 1 MIPS on a laptop
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different preferences. Assembly uses snake_case, while JavaScript varies between the two conventions depending on the contributor
- The sample assembly programs are not optimized, and neither is the Z80 simulator.
- UI could use a lot of fixing and polish. CSS is far more complex than Z80 Assembly.

## Easter Eggs

Since you got this far, might as well spoil the Easter eggs:

- **Before you press "Assemble and Run":** Clicking on the simulated screen triggers a small grayscale animation.
- **Space Invader Game:** If you press the **W** key during the game, your base becomes invisible so it cannot be hit by bombs.


## About This Project

This project helped me explore how to work with today's AI coding tools.
It was a lot of fun too.