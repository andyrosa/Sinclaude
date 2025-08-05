# Sinclaude - A ZX81 Z80 Assembly Emulator Just For Fun

A web-based ZX81/Spectrum/Z80 simulator somewhat-carefully co-written with Claude.

**Live at:** https://andyrosa.github.io/Sinclaude/simulator.html
**Repo:** https://github.com/andyrosa/Sinclaude

## Features

- Pretty good Z80 assembly language assembler
- Quite fast CPU emulation with register display
- Single-step and continuous execution modes
- Performance monitoring
- ZX81-style display (32x24) with block characters
- Spectrum lowercase characters
- Keyboard input translation
- Share and save small programs using automatic serverless URL
- Can run off the file system (*really* serverless)

## Technical Details

### Memory Map
- 64K of RAM
- Screen address fixed at 60000. Rows are full width and there are no HALT bytes.
- Key scan address is 59999. This is how the PC sends keys to the simulator.
- Frame counter at 59998. This is how the PC sends something akin to time to the simulator. Useful for speed control and time monitoring. Beats manual-path-independent-constant-clock-cycle programming.

## State
- Web page loads in the state "state_not_ready" - trying to run or step shows a warning.
- If it detects an "asm" param in the URL, it converts its value into an assembly listing.
- If it does not, it loads default_assembly.js, which contains a "Space Invader" program.
- User clicks "Assemble and Run"
- Any time "Assemble" succeeds, the state changes to state_free_running.
- Any time the state changes to state_free_running, the assembled program is started.
- Before the progrm starts, the program counter and stack pointer are set. Memory and registers are not cleared.
- The buttons available in state_free_running are:
  - "Break" which switches the state to state_stepping
  - "Reset", which resets the program counter
  - "-> Fast" which disables screen rendering, making emulation a tiny bit faster
  - "-> Slow" which re-enables screen rendering
- The buttons available in state_stepping are:
  - "Step" which executes one instruction and stays in stepping mode
  - "Reset" which resets the program counter
  - "Run" which switches the state to state_free_running

### Assembler Features

- Two-pass assembly process.
- Z80 instructions supported including most versions of:
  - Load instructions (LD) with immediate values and register transfers
  - Arithmetic operations (ADD, SUB, INC, DEC)
  - Control flow (CALL, RET, JP, JR, DJNZ) with conditional variants
  - Logic operations (AND, OR, XOR, CP)
  - Stack operations (PUSH, POP)
  - Block operation (LDIR)
- Assembler directives (ORG, EQU, DB, DEFW, DEFS, END) (more than I ever had)
- Label support with arithmetic expressions
- Multiple number formats (decimal, hex, binary)
- String literals in data directives
- Error reporting with line numbers
- Machine code output that include line numbers, decimal data, and checksums, perfect for sharing in a magazine article in places like 'Sinclair User" and 'Your Computer' before Github gets/got invented

### Current Limitations

- Lots of Z80 instructions not implemented (for instance LD B, C might exist, but not LD C,B)
- The emulator has a long switch case. In the old times we exploited the patterns in the opcodes.
- Minimal flag handling - primarily the easy to remember flags: C and Z
- No ROM emulation. Many rabbit holes avoided. I saw again why many of us love writing simulators/emulators/game engines.
- "Fast mode" is only a tiny bit faster than Slow. That's good/bad.
- It takes close to 100% of JavaScript's thread. We are going for raw performance, kind of.

## Code Architecture

### Dependency Loading Order
Scripts are loaded in the following order to ensure proper dependencies:
1. `constants.js` - Core configuration values
2. `console-utils.js` - Logging infrastructure  
3. `assembler.js` - Z80 assembler engine
4. `z80cpu.js` - Z80 CPU emulation
5. `default_assembly.js` & `benchmark_assembly.js` - Sample programs
6. `sinclair.js` - Main controller class (~1,300 lines)
7. `initialization.js` - Application bootstrap

## Project Files

### Core Interface
- `index.html` - A retro landing page that includes this document
- `README.md` - This documentation
- `simulator.html` - Main web interface with HTML structure and script loading

### Project Infrastructure
- `version.js` - Build version and cache busting functionality
- `styles.css` - CSS styling for the web interface 

## Usage

1. Open `simulator.html` in a web browser. Can be run directly from disk, without a web server.
2. Type Z80 assembly code in the input area
3. Click "Assemble and Run" to compile the code. If no errors, it runs it.
4. Use "Break" to switch to single instruction execution
5. Use "Fast" to lose the live screen yet gain little in performance. Times have changed.

### Saving Programs

When you assemble a program, the URL automatically updates to include the encoded program. With this URL you can:
- Bookmark URLs to save your programs
- Share the URL with others to share your program
- If the assembly program exceeds 1K of text, it will not generate a URL because of limitations on the size of the URLs. 16K of RAM will not help.

## Known Issues
- 90 MIPS on a phone, sometimes as low as 1 MIPS on a laptop, no idea why.
- The codebase uses a mix of camelCase and snake_case naming conventions because the authors have different tastes. Assembly uses snake_case, while JavaScript varies between the two conventions depending on the contributor.
- Saving opcodes to the URL would be much more efficient, but then we'd need a disassembler. AI enables scope creep and yak shaving to a new level.

## About This Project

This would have taken a week to write in 1982 when AI meant a) Lisp b) one-dozen neuron perceptrons. 'Writing' this 'app' was a lot of fun.
