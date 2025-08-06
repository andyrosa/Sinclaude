const SCREEN_START = 60000;
const SCREEN_WIDTH = 32;
const SCREEN_HEIGHT = 24;
const MEMORY_SIZE = 65536;
const KEYBOARD_POKE = 59999;
const VERT_COUNT = 59998;
const KBD_NO_KEY_PRESSED = -1;

class Simulator {
    constructor() {
        this.assembler = new Z80Assembler();
        this.cpu = new Z80CPU();
        this.memory = new Uint8Array(MEMORY_SIZE);
        this.setState(STATE.NOT_READY);
        this.instructionCount = 0;
        this.mipsValue = 0.0;
        this.refreshRate = 0.0;
        this.lastRefreshTime = performance.now();
        this.refreshCount = 0;
        this.mipsLastUpdate = performance.now();
        this.mipsInstructionCount = 0;
        this.keyCodeCurrent = 0;
        this.keyCodeCurrentReleased= true;
        this.runLoopId = null;
        this.fastMode = false;
        this.easterEggEnabled = false;

        // Screen optimization tracking
        this.lastScreenState = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
        this.screenElements = [];

        // Timer management
        this.activeTimers = new Set();
        this.displayUpdateInterval = null;

        // Sinclair byte <-> Unicode char
        this.sinclairByteToUnicodeNeverInverts = {};
        this.initializeCharacterMappings();
        this.initializeKeyMappings();

        this.setupDOM();
        this.setupKeyboard();
        this.setupDisplayUpdates();
        this.setupCleanupHandlers();
        this.initializeSinclairMemory();
    }

    initializeCharacterMappings() {
        // Hybrid ZX/Spectrum character set mapping (bytes 0-255 to Unicode)
        const sinclairByteToUnicode = [
            // 0-31: Mix of undefined and block graphics
            '⸮', '⸮', '⸮', '⸮', '⸮', '⸮', '▌', '⸮', '▄', '▖', '⸮', '⸮', '⸮', '▗', '▝', '⸮',
            '▐', '▞', '▚', '▟', '▙', '▀', '▛', '⸮', '⸮', '⸮', '⸮', '⸮', '⸮', '⸮', '⸮', '⸮',
            // 32-63: Space, punctuation, numbers
            ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
            // 64-95: @, A-Z, punctuation
            '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
            'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '↑', '_',
            // 96-127: £, a-z, symbols 
            '£', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
            'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~', '©'
        ];

        // Build Sinclair byte -> Unicode char
        for (let i = 0; i < 128; i++) {
            this.sinclairByteToUnicodeNeverInverts[i] = sinclairByteToUnicode[i] || '?';
        }

        // Extended range 128-255: Inverted/flashing characters
        // In ZX Spectrum, 128+ were inverted versions of 0-127
        for (let i = 128; i < 256; i++) {
            const baseChar = sinclairByteToUnicode[i - 128];
            this.sinclairByteToUnicodeNeverInverts[i] = baseChar || '?';
        }
    }

    setupDOM() {
        // Get DOM elements
        this.screen = document.getElementById('screen');
        this.keyCodeCurrentDisplay = document.getElementById('keyCodeCurrent');
        this.pcDisplay = document.getElementById('regPC');
        this.spDisplay = document.getElementById('regSP');
        this.regADisplay = document.getElementById('regA');
        this.regBCDisplay = document.getElementById('regBC');
        this.regDEDisplay = document.getElementById('regDE');
        this.regHLDisplay = document.getElementById('regHL');
        this.flagCDisplay = document.getElementById('flagC');
        this.flagZDisplay = document.getElementById('flagZ');
        this.currentInstructionDisplay = document.getElementById('currentInstruction');
        this.mipsDisplay = document.getElementById('mips');
        this.refreshRateDisplay = document.getElementById('refreshRate');

        // Generate program buttons and key inputs
        this.createGameButtons();
        
        // Initialize edit toggle text by triggering the two-state function
        toggleButtonEdit();
        toggleButtonEdit();
        
        // Setup touch hints for touch-enabled devices
        this.setupTouchHints();
    }

    createGameButtons() {
        const gameButtonsDiv = document.getElementById('gameButtons');
        const defaultKeys = ['A', 'S', 'Space', 'W', 'D'];

        // Clear existing content
        gameButtonsDiv.innerHTML = '';

        // Create 5 program buttons with key names as text
        for (let i = 1; i <= 5; i++) {
            // Create button
            const button = document.createElement('button');
            button.textContent = defaultKeys[i - 1];
            button.tabIndex = 0; // Make button focusable when clicked
            button.dataset.buttonNumber = i; // Store button number for reference
           
            // Add event listeners for both game functionality and edit mode
            button.addEventListener('pointerdown', (e) => {
                this.handleButtonClick(button, i, e);
                e.preventDefault();
            });
            button.addEventListener('pointerup', (e) => {
                if (!window.buttonEditMode) {
                    this.releaseKey();
                }
                e.preventDefault();
            });
                        
            gameButtonsDiv.appendChild(button);
        }
    }

    handleButtonClick(button, buttonNumber, event) {
        if (window.buttonEditMode) {
            this.editButtonText(button);
        } else {
            this.buttonClick(buttonNumber);
        }
    }

    editButtonText(button) {
        const text = button.textContent;
        const input = document.createElement('input');
        input.className = 'edit-input';
        input.type = 'text';
        input.value = text;
        input.maxLength = 10; // Allow for longer key names like "Escape"
        
        button.innerHTML = '';
        button.appendChild(input);
        
        // Small delay to ensure proper focus
        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);
        
        const finishEdit = () => {
            const typedCaption = input.value.trim();
            
            // Validate the key name using existing validation logic
            const readableLabel = this.toReadableKeyLabel(typedCaption);
            let finalText;
            
            if (readableLabel) {
                finalText = readableLabel;
            } else if (typedCaption === '') {
                // Empty input - keep original text
                finalText = text;
            } else {
                // Invalid input - show message and keep original text
                userMessage(`Invalid key configuration "${typedCaption}" - reset to previous value`);
                finalText = text;
            }
            
            button.innerHTML = finalText;
        };
        
        input.addEventListener('blur', finishEdit);
    }

    setupKeyboard() {
        /*
        ### Keyboard Processing Pipeline (Example: Escape Key)

        **Direct Keyboard Input:**
        1. **Key Press** → `keydown` event handler calls `setKey(27)` directly.
        2. **Special Handling** → `setKey(27)` maps 27 → 12 (Sinclair ESC code).
        3. **Memory Poke** → `pokeMemory()` writes 12 to address KEYBOARD_IN.

        **Programmable Button Input:**
        1. **User Configuration** → User types "Escape" in a button's textbox.
        2. **Button Click** → `buttonClick()` reads "Escape" from the button's caption.
        3. **Code Conversion** → `labelToKeyCodeOrNull("Escape")` returns 27.
        4. **Special Handling** → `setKey(27)` maps 27 → 12 (Sinclair ESC code).
        5. **Memory Poke** → `pokeMemory()` writes 12 to address KEYBOARD_IN.

        **Keyboard Capture Activation:**
        - **Hover**: Activated when the `.execution-section` is hovered.
        - **Focus**: Activated when the `.execution-section` gains focus (e.g., via tabbing).
        - **Touch**: Activated when the `.execution-section` is touched on mobile devices.

        **Keyboard Capture Deactivation:**
        - **Mouse Leave**: Deactivated when the `.execution-section` is no longer hovered.
        - **Blur**: Deactivated when the `.execution-section` loses focus.
        - **Outside Touch**: Deactivated when a touch occurs outside the `.execution-section`.
        */

        // Get the execution section container
        const executionSection = document.querySelector('.execution-section');
        if (!executionSection) {
            userMessageAboutBug("Keyboard setup failed - execution section not found", "setupKeyboard() called but .execution-section element not found in DOM");
            return;
        }

        // Make the execution section focusable
        executionSection.tabIndex = 0;

        const keyboardStatus = document.getElementById('keyboardStatus');
        this.keyboardCaptureActive = false;

        // Define the two keyboard status messages
        const HOVER_MESSAGE = 'Hover this area for key presses to be sent to Sinclaude';
        const ACTIVE_MESSAGE = 'This area is now sending key presses to Sinclaude';

        // Helper function to update keyboard status
        const updateKeyboardStatus = (isActive) => {
            if (keyboardStatus) {
                keyboardStatus.textContent = isActive ? ACTIVE_MESSAGE : HOVER_MESSAGE;
                // Add attention-grabbing class when showing hover message
                if (isActive) {
                    keyboardStatus.classList.remove('hover-state');
                } else {
                    keyboardStatus.classList.add('hover-state');
                }
            }
        };

        // Set initial state
        updateKeyboardStatus(false);

        // Desktop: Hover-based keyboard capture
        executionSection.addEventListener('mouseenter', () => {
            this.keyboardCaptureActive = true;
            updateKeyboardStatus(true);
        });

        executionSection.addEventListener('mouseleave', () => {
            this.keyboardCaptureActive = false;
            updateKeyboardStatus(false);
            this.setKey(KBD_NO_KEY_PRESSED); 
        });

        executionSection.addEventListener('focus', () => {
            this.keyboardCaptureActive = true;
            updateKeyboardStatus(true);
        });

        executionSection.addEventListener('blur', () => {
            this.keyboardCaptureActive = false;
            updateKeyboardStatus(false);
            this.setKey(KBD_NO_KEY_PRESSED);
        });

        // Mobile: Touch-based keyboard capture
        executionSection.addEventListener('pointerdown', (e) => {
            this.keyboardCaptureActive = true;
            updateKeyboardStatus(true);
        });

        // Document-level touch to detect touches outside execution section
        document.addEventListener('pointerdown', (e) => {
            if (!executionSection.contains(e.target)) {
                this.keyboardCaptureActive = false;
                updateKeyboardStatus(false);
                this.setKey(KBD_NO_KEY_PRESSED);
            }
        });

        // Document-level keyboard capture - only process when capture is active
        document.addEventListener('keydown', (e) => {
            if (this.keyboardCaptureActive) {
                // Don't capture keyboard input when user is typing in input boxes or textareas
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return; // Allow normal browser behavior for form inputs
                }
                this.setKey(e.keyCode || e.which);
                e.preventDefault(); // Prevent default browser behavior
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.keyboardCaptureActive) {
                // Don't capture keyboard input when user is typing in input boxes or textareas
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return; // Allow normal browser behavior for form inputs
                }
                this.setKey(KBD_NO_KEY_PRESSED); 
                e.preventDefault();
            }
        });
    }

    initializeKeyMappings() {
        // Pre-populate bidirectional mapping for special keys only
        const specialKeys = [
            [32, 'Space'],
            [27, 'Escape'],
            [38, 'ArrowUp'],
            [40, 'ArrowDown'],
            [37, 'ArrowLeft'],
            [39, 'ArrowRight'],
            [13, 'Enter'],
            [9, 'Tab']
        ];

        this.keyCodeToKeyName = new Map(specialKeys);
        this.lcKeyNameToKeyCode = new Map(specialKeys.map(([code, name]) => [name.toLowerCase(), code])); // lowercase for easier find
    }

    toReadableKeyLabel(typedCaption) {
        if (!typedCaption || typeof typedCaption !== 'string') {
            return null;
        }

        const lcTypedCaption = typedCaption.toLowerCase(); // Normalize input to lowercase

        if (this.lcKeyNameToKeyCode.has(lcTypedCaption)) {
            const code = this.lcKeyNameToKeyCode.get(lcTypedCaption);
            return this.keyCodeToKeyName.get(code);
        }

        // If single character and printable ASCII (32-136), keep as is
        if (lcTypedCaption.length === 1) {
            const keyCode = lcTypedCaption.charCodeAt(0);
            if (keyCode >= 32 && keyCode <= 136) {
                return typedCaption;
            }
        }

        return null; // Invalid input
    }

    labelToKeyCodeOrNull(label) {
        if (!label || typeof label !== 'string') {
            return null;
        }

        // Try to get keyCode from our mapping
        const keyCode = this.lcKeyNameToKeyCode.get(label.toLowerCase());
        if (keyCode) {
            return keyCode;
        }

        // For single characters, get charCode
        if (label.length === 1) {
            return label.toUpperCase().charCodeAt(0);
        }

        return null;
    }

    setupTouchHints() {
        // Show touch hints only on touch-enabled devices
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isTouchDevice) {
            const touchHints = document.querySelectorAll('.touch-hint');
            touchHints.forEach(hint => {
                hint.style.display = 'block';
            });
        }
    }

    buttonClick(buttonNumber) {
        // Get the button text instead of text box value
        const gameButtonsDiv = document.getElementById('gameButtons');
        const buttons = gameButtonsDiv.querySelectorAll('button');
        const button = buttons[buttonNumber - 1]; // Convert to 0-based index
        
        if (!button) return;

        const value = button.textContent.trim();

        const keyCodeOrNull = this.labelToKeyCodeOrNull(value);

        if (keyCodeOrNull != null) {
            this.setKey(keyCodeOrNull);
        } else {
            userMessageAboutBug('Cannot press key', `Invalid configuration "${value}"`);
        }
    }

    releaseKey() {
        // Release key (send no-key value)
        this.setKey(KBD_NO_KEY_PRESSED); 
    }

    pokeMemory(address, value, description) {
        this.memory[address] = value;
    }

    setKey(keyCode) {
        this.keyCodeCurrentReleased = keyCode === KBD_NO_KEY_PRESSED;
        if (!this.keyCodeCurrentReleased){
            this.keyCodeCurrent = keyCode;
        }

        if (keyCode === KBD_NO_KEY_PRESSED) { 
            this.pokeMemory(KEYBOARD_POKE, KBD_NO_KEY_PRESSED, 'no-key');
        } else if (keyCode === 27) {
            this.pokeMemory(KEYBOARD_POKE, 12, 'ESC key');
        } else if (keyCode === 13) {
            this.pokeMemory(KEYBOARD_POKE, 13, 'ENTER key');
        } else if (keyCode === 37) {
            this.pokeMemory(KEYBOARD_POKE, 144, 'LEFT arrow');
        } else if (keyCode === 38) {
            this.pokeMemory(KEYBOARD_POKE, 145, 'UP arrow');
        } else if (keyCode === 39) {
            this.pokeMemory(KEYBOARD_POKE, 146, 'RIGHT arrow');
        } else if (keyCode === 40) {
            this.pokeMemory(KEYBOARD_POKE, 147, 'DOWN arrow');
        } else {
            const sinclairCode = this.unicodeToSinclair(String.fromCharCode(keyCode));
            this.pokeMemory(KEYBOARD_POKE, sinclairCode, `key ${keyCode} -> "${String.fromCharCode(keyCode)}"`);
        }
    }

    initializeSinclairMemory() {
        // Define stage configuration (duration in ms, handler function)
        // Animation removed from boot sequence - now easter egg only
        this.stageConfig = [
            { duration: 1000, handler: 'displayCharacterGrid' },
            { duration: 1000, handler: 'benchmarkCPU' },
            { duration: -1, handler: 'showSinclairCopyright' }
        ];

        // Start the transition chain
        this.startStage(0);
    }


    startStage(stageIndex) {
        // Validate stage index
        const stage = this.stageConfig[stageIndex];
        if (!stage) {
            userMessageAboutBug('Unknown stage index', `startStage(${stageIndex}) called with unknown index`);
            return;
        }

        // Clean up any previous stage timers
        if (this.currentStageTimer) {
            this.clearTimer(this.currentStageTimer);
            this.currentStageTimer = null;
        }

        // Execute stage handler
        const handlerFunction = this[stage.handler];
        if (typeof handlerFunction === 'function') {
            const result = handlerFunction.call(this);
            // Store timer ID if handler returns one
            if (result) {
                this.currentStageTimer = result;
            }
        } else {
            userMessageAboutBug('Stage handler not found', `Handler function '${stage.handler}' not found`);
            return;
        }

        // Schedule next stage if duration is set and there's a next stage
        if (stage.duration > 0 && stageIndex + 1 < this.stageConfig.length) {
            this.createTimer(() => {
                this.startStage(stageIndex + 1);
            }, stage.duration, false);
        }
    }

    benchmarkCPU() {
        const benchedProgram = "ORG 0\nJP 0"; // Infinite loop at address 0; JR is not significantly faster; NOP seems to be but not worth the noise
        const assemble = this.assembler.assemble(benchedProgram);

        if (assemble.success) {
            // load NOP program at address 0
            const benchMemory = new Uint8Array(MEMORY_SIZE);
            for (let i = 0; i < assemble.machineCode.length; i++) {
                benchMemory[i] = assemble.machineCode[i];
            }

            // Create a temporary CPU for benchmarking
            const benchCPU = new Z80CPU();

            // Benchmark configuration constants
            const worst_mips = .5; // Worst case MIPS performance
            const target_sec = .5; // Target execution time in seconds
            const minimum_sec = 1/60 * 10; // Minimum execution time for accurate measurement given aprox OS jitter
            let instructions = worst_mips * one_million * target_sec; // Convert MIPS to instructions

            const runBenchmark = (instructionCount) => {
                const startTime = performance.now();
                const benchResult = benchCPU.execute(benchMemory, instructionCount);
                const endTime = performance.now();
                const elapsedTime = (endTime - startTime) / 1000; // seconds
                return { benchResult, elapsedTime };
            };

            let benchmarkResult;

            // get enough accuracy
            while (true) {
                benchmarkResult = runBenchmark(instructions);
                if (benchmarkResult.elapsedTime >= minimum_sec) break;
                instructions *= 2;
            }

            // If we're below target_sec, repeat this until it reaches target because it seems JIC might be preventing it reaching it one pass
            if (benchmarkResult.elapsedTime < target_sec) {
                instructions *= target_sec / benchmarkResult.elapsedTime;
                benchmarkResult = runBenchmark(instructions);
            }

            const MIPS = (benchmarkResult.benchResult.instructionsExecuted / benchmarkResult.elapsedTime) / one_million;

            userMessage(`CPU Benchmark: ${benchmarkResult.benchResult.instructionsExecuted.toLocaleString()} instructions in ${benchmarkResult.elapsedTime.toFixed(3)}s running "${benchedProgram.replace(/\n/g, '\\n')}" = ${MIPS.toFixed(1)} MIPS`);
        } else {
            userMessageAboutBug('Benchmark assembly failed', assemble.error);
        }
    }

    clearScreen() {
        // Fill entire screen with spaces (black background)
        for (let line = 0; line < SCREEN_HEIGHT; line++) {
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const addr = SCREEN_START + line * SCREEN_WIDTH + col;
                this.memory[addr] = this.unicodeToSinclair(' '); // Space character
            }
        }
    }

    displayCharacterGrid() {
        // Display character codes and characters in columns
        // Format: "00X 01Y 02Z 03A" etc. (hex codes, 8 columns per row)

        // Clear screen first
        this.clearScreen();

        // Display characters 0-255 in 8 columns per row (fits perfectly in screen width)
        let currentLine = 0;

        for (let charCode = 0; charCode < 256 && currentLine < SCREEN_HEIGHT; charCode += 8) {
            // Write character codes and characters directly as bytes
            for (let col = 0; col < 8; col++) {
                const code = charCode + col;
                if (code < 256) {
                    const baseCol = col * 4; // Each entry takes 4 characters
                    const addr = SCREEN_START + currentLine * SCREEN_WIDTH + baseCol;

                    // Write hex code (2 chars)
                    const codeStr = code.toString(16).padStart(2, '0').toUpperCase();
                    this.memory[addr] = this.unicodeToSinclair(codeStr[0]);
                    this.memory[addr + 1] = this.unicodeToSinclair(codeStr[1]);

                    // Write the actual character byte directly (this preserves 128-255 range)
                    this.memory[addr + 2] = code;

                    // Write space separator
                    this.memory[addr + 3] = this.unicodeToSinclair(' '); // Space
                }
            }

            currentLine++;
        }
    }

    playArtisticAnimation() {
        // Set up animation interval and return the timer ID
        const animationTimer = this.createTimer(() => {
            this.renderArtisticPattern();
        }, 20, true); // smooth animation

        // Call the animation function immediately for the first frame
        this.renderArtisticPattern();

        // Return timer ID so caller can clean it up
        return animationTimer;
    }

    renderArtisticPattern() {
        // Initialize screen memory with artistic pattern using Sinclair block graphics
        const blockChars = [6, 8, 9, 13, 14, 16, 17, 18, 19, 20, 21, 22]; // Various block graphics

        for (let line = 0; line < SCREEN_HEIGHT; line++) {
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const addr = SCREEN_START + line * SCREEN_WIDTH + col;

                // Create concentric diamond/wave pattern
                const centerX = 16;
                const centerY = 12;
                const distanceFromCenter = Math.abs(col - centerX) + Math.abs(line - centerY);

                // Create ripple effect with time-based animation
                const time = Date.now() * 0.001; // Convert to seconds
                const wave = Math.sin(distanceFromCenter * 0.5 + time * 2);
                const pattern = Math.sin(line * 0.3 + col * 0.2 + time) * Math.cos(distanceFromCenter * 0.4 + time * 1.5);

                // Combine patterns for artistic effect
                const combinedPattern = (wave + pattern + Math.sin(time + line * col * 0.01)) / 3;
                const charIndex = Math.floor((combinedPattern + 1) * 0.5 * blockChars.length);

                this.memory[addr] = blockChars[Math.max(0, Math.min(blockChars.length - 1, charIndex))];
            }
        }
    }

    showSinclairCopyright() {
        // Fill entire screen with black/empty spaces
        this.clearScreen();

        // Add clean copyright notice in the center
        const copyrightText = "(C) 1981 SINCLAIR RESEARCH";
        const centerLine = Math.floor(SCREEN_HEIGHT / 2); // Middle of screen
        const padding = Math.floor((SCREEN_WIDTH - copyrightText.length) / 2);
        const copyrightStart = SCREEN_START + centerLine * SCREEN_WIDTH;

        for (let i = 0; i < copyrightText.length; i++) {
            this.memory[copyrightStart + padding + i] = this.unicodeToSinclair(copyrightText[i]);
        }

        // Enable easter egg after showing SINCLAIR screen
        this.easterEggEnabled = true;
        this.setupAnimationEasterEgg();
    }

    setupAnimationEasterEgg() {
        if (!this.screen) return;

        const handleClick = () => {
            if (this.easterEggEnabled) {
                this.triggerAnimationEasterEgg();
            }
        };

        // Remove existing listeners to avoid duplicates
        this.screen.removeEventListener('click', this.animationEasterEggHandler);
        this.screen.removeEventListener('touchstart', this.animationEasterEggHandler);

        // Store handler reference for cleanup
        this.animationEasterEggHandler = handleClick;

        // Add click and touch listeners
        this.screen.addEventListener('pointerdown', handleClick);
        this.screen.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleClick();
        });
    }

    triggerAnimationEasterEgg() {
        // Show animation for 5 seconds then return to SINCLAIR screen
        const animationTimer = this.playArtisticAnimation();

        this.createTimer(() => {
            this.clearTimer(animationTimer);
            this.showSinclairCopyright();
        }, 3000, false);
    }

    toggleSpeed() {
        const wasInFastMode = this.fastMode;
        this.fastMode = !this.fastMode;
        const toggleButton = document.getElementById('speedToggle');
        if (toggleButton) {
            toggleButton.textContent = this.fastMode ? '→ Slow' : '→ Fast';
        }

        // If exiting fast mode, invalidate screen cache to force rebuild
        if (wasInFastMode && !this.fastMode) {
            this.screenElements = [];
        }
    }
    // Timer management methods
    createTimer(callback, interval, isInterval = true) {
        const timerId = isInterval ? setInterval(callback, interval) : setTimeout(callback, interval);
        this.activeTimers.add(timerId);
        return timerId;
    }

    clearTimer(timerId) {
        if (timerId) {
            clearInterval(timerId);
            clearTimeout(timerId);
            this.activeTimers.delete(timerId);
        }
    }

    clearAllTimers() {
        this.activeTimers.forEach(id => {
            clearInterval(id);
            clearTimeout(id);
        });
        this.activeTimers.clear();
        this.displayUpdateInterval = null;
    }

    setupDisplayUpdates() {
        // Clear any existing display interval
        if (this.displayUpdateInterval) {
            this.clearTimer(this.displayUpdateInterval);
        }

        this.displayUpdateInterval = this.createTimer(() => {
            if (!this.fastMode) {
                this.updateScreen();
            } else {
                // In fast mode, make screen black
                if (this.screen) {
                    this.screen.textContent = '';
                    // Reset screen elements cache so it rebuilds when exiting fast mode
                    this.screenElements = [];
                }
            }
            this.updateRefreshRate();
            this.updateHardwareDisplay();
            this.updateMIPS();

            // Increment VERT_COUNT on each frame
            this.memory[VERT_COUNT] = (this.memory[VERT_COUNT] + 1) & 0xFF;
        }, 1000 / FPS, true);
    }

    updateScreen() {
        if (!this.screen) return;

        // Initialize screen elements cache if needed
        if (this.screenElements.length === 0) {
            this.initializeScreenElements();
        }

        // Only update changed characters
        for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
            const newByte = this.memory[SCREEN_START + i];
            if (this.lastScreenState[i] !== newByte) {
                this.updateCharacterAt(i, newByte);
                this.lastScreenState[i] = newByte;
            }
        }
    }

    initializeScreenElements() {
        // Clear existing content
        this.screen.innerHTML = '';
        this.screenElements = [];

        // Create individual character divs for precise grid positioning
        for (let line = 0; line < SCREEN_HEIGHT; line++) {
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const charDiv = document.createElement('div');
                charDiv.className = 'screen-char';
                this.screen.appendChild(charDiv);

                const index = line * SCREEN_WIDTH + col;
                this.screenElements[index] = charDiv;

                // Initialize with current memory content
                const byte = this.memory[SCREEN_START + index];
                this.updateCharacterAt(index, byte);
                this.lastScreenState[index] = byte;
            }
        }
    }

    updateCharacterAt(index, byte) {
        const element = this.screenElements[index];
        if (!element) return;

        const char = this.sinclairToUnicode(byte);
        element.textContent = char;

        // Apply inverted styling for characters 128-255
        if (byte >= 128) {
            element.classList.add('inverted');
        } else {
            element.classList.remove('inverted');
        }
    }

    updateRefreshRate() {
        const currentTime = performance.now();
        const timeElapsed = (currentTime - this.lastRefreshTime) / 1000; // seconds
        this.refreshCount++;

        if (timeElapsed >= 1.0) { // Update refresh rate display every second
            this.refreshRate = this.refreshCount / timeElapsed;
            this.refreshCount = 0;
            this.lastRefreshTime = currentTime;
        }
    }

    // Sinclair byte code → Modern Unicode character conversion  
    sinclairToUnicode(byte) {
        // Direct lookup from single canonical charset
        if (byte >= 0 && byte <= 255) {
            return this.sinclairByteToUnicodeNeverInverts[byte] || '?';
        }
        return '?';
    }

    // Modern Unicode character → Sinclair byte code conversion
    unicodeToSinclair(char) {
        // Search through sinclairCharset to find matching character, return byte code
        for (let byte = 0; byte < 256; byte++) {
            if (this.sinclairByteToUnicodeNeverInverts[byte] === char) {
                return byte;
            }
        }
        // Try uppercase version for case-insensitive matching
        const upperChar = char.toUpperCase();
        for (let byte = 0; byte < 256; byte++) {
            if (this.sinclairByteToUnicodeNeverInverts[byte] === upperChar) {
            return byte;
            }
        }
        return 0;
        }

        updateHardwareDisplay() {
        const regs = this.cpu.registers;

        if (!regs) {
            userMessageAboutBug('CPU registers are undefined');
            return;
        }

        if (this.pcDisplay) {
            this.pcDisplay.textContent = regs.PC.toString(16).padStart(4, '0').toUpperCase();
        }
        if (this.spDisplay) {
            this.spDisplay.textContent = regs.SP.toString(16).padStart(4, '0').toUpperCase();
        }
        if (this.regADisplay) {
            this.regADisplay.textContent = regs.A.toString(16).padStart(2, '0').toUpperCase();
        }
        if (this.regBCDisplay) {
            this.regBCDisplay.textContent = regs.B.toString(16).padStart(2, '0').toUpperCase() + regs.C.toString(16).padStart(2, '0').toUpperCase();
        }
        if (this.regDEDisplay) {
            this.regDEDisplay.textContent = regs.D.toString(16).padStart(2, '0').toUpperCase() + regs.E.toString(16).padStart(2, '0').toUpperCase();
        }
        if (this.regHLDisplay) {
            this.regHLDisplay.textContent = regs.H.toString(16).padStart(2, '0').toUpperCase() + regs.L.toString(16).padStart(2, '0').toUpperCase();
        }
        if (this.flagCDisplay) {
            this.flagCDisplay.textContent = regs.F.C ? '1' : '0';
        }
        if (this.flagZDisplay) {
            this.flagZDisplay.textContent = regs.F.Z ? '1' : '0';
        }
        if (this.currentInstructionDisplay) {
            const memVal = this.memory[regs.PC];
            this.currentInstructionDisplay.textContent = '0x' + memVal.toString(16).padStart(2, '0').toUpperCase();
        }
        if (this.keyCodeCurrentDisplay) {
            // Show diagonal if keyCodeCurrentReleased is true
            if (this.keyCodeCurrent == null) {
                this.keyCodeCurrentDisplay.textContent = '--';
            } else if (this.keyCodeCurrentReleased) {
                this.keyCodeCurrentDisplay.textContent = '(' + this.keyCodeCurrent + ')';
            } else {
                this.keyCodeCurrentDisplay.textContent = this.keyCodeCurrent;
            }}
        if (this.mipsDisplay) {
            if (typeof this.mipsValue === 'number') {
                this.mipsDisplay.textContent = this.mipsValue < 10 ? this.mipsValue.toFixed(1) : Math.round(this.mipsValue);
            } else {
                this.mipsDisplay.textContent = this.mipsValue;
            }
        }
        if (this.refreshRateDisplay) {
            this.refreshRateDisplay.textContent = Math.round(this.refreshRate);
        }
    }

    clearMagazineListing() {
        const machineCodeDiv = document.getElementById('machineCode');
        if (machineCodeDiv) {
            machineCodeDiv.textContent = '';
            machineCodeDiv.classList.remove('error');
        }
    }

    clearAssembly() {
        document.getElementById('assemblyInput').value = '';
        this.clearMagazineListing();
        this.setState(STATE.NOT_READY);
        this.updateURL('');
    }

    loadAssemblyCode(code) {
        if (!code) return;

        // Remove first line feed if it's followed by non-blank content
        if (code.startsWith('\n') && code.length > 1 && code[1].trim() !== '') {
            code = code.substring(1);
        }

        document.getElementById('assemblyInput').value = code;
        this.clearMagazineListing();
    }

    loadDefaultAssembly() {
        this.loadAssemblyCode(typeof DEFAULT_ASM !== 'undefined' ? DEFAULT_ASM : null);
    }
    loadBenchmarkAssembly() {
        this.loadAssemblyCode(typeof BENCHMARK_ASM !== 'undefined' ? BENCHMARK_ASM : null);
    }
    loadSpaceInvaderAssembly() {
        this.loadAssemblyCode(typeof SPACE_INVADER_ASM !== 'undefined' ? SPACE_INVADER_ASM : null);
    }


    assembleAndRun() {
        const sourceCode = document.getElementById('assemblyInput').value;
        const machineCodeDiv = document.getElementById('machineCode');

        const result = this.assembler.assemble(sourceCode);
        this.loadAddress = result.loadAddress;

        if (result.success) {

            // Load machine code into memory (without clearing existing memory)
            for (let i = 0; i < result.machineCode.length; i++) {
                this.memory[result.loadAddress + i] = result.machineCode[i];
            }

            if ((this.state === STATE.FREE_RUNNING)) {
                // Hot-reload case: preserve CPU state, just inform user
                userMessage('Code hot-reloaded - may need Reset to run properly');
                sinclaude.cpu.set(this.loadAddress);
            } else {
                sinclaude.cpu.set(this.loadAddress, 0);
                this.setState(STATE.FREE_RUNNING);
            }

            machineCodeDiv.textContent = this.assembler.displayMachineCode(result.machineCode, result.loadAddress);
            machineCodeDiv.classList.remove('error');

            // Update URL with encoded program
            this.updateURL(sourceCode);
            
            // Scroll to bottom of page after successful assembly and give focus to execution area
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            
            // Give focus to the execution section after a brief delay to allow scroll to complete
            setTimeout(() => {
                const executionSection = document.querySelector('.execution-section');
                if (executionSection) {
                    executionSection.focus();
                }
            }, 500); // Wait for scroll animation to complete
            
            // Scroll to top of page after successful assembly
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // Show all errors in machine code window
            let errorText = 'Assembly Errors:\n\n';
            if (result.errors) {
                const lines = sourceCode.split('\n');
                result.errors.forEach(error => {
                    const line = lines[error.line - 1] || '';
                    errorText += `Line ${error.line}, 0x${(error.address || 0).toString(16).toUpperCase()}: "${line.trim()}" - ${error.message}\n`;
                });
            } else {
                errorText += result.error || 'Unknown error';
            }
            machineCodeDiv.textContent = errorText;
            machineCodeDiv.classList.add('error');
            this.setState(STATE.NOT_READY);
        }
    }

    updateURL(sourceCode) {
        if (this.isUrlUpdateDisabled()) {
            return;
        }

        try {
            const newUrl = new URL(window.location);

            if (!sourceCode || sourceCode.trim() === '') {
                // Remove asm parameter when clearing
                newUrl.searchParams.delete('asm');
            } else {
                // Set asm parameter when there's code
                const maxUrlLength = 2048 - 100;
                const baseUrl = window.location.origin + window.location.pathname + '?asm=';
                const encoded = btoa(encodeURIComponent(sourceCode));
                const totalLength = baseUrl.length + encoded.length;

                if (totalLength > maxUrlLength) {
                    const overage = totalLength - maxUrlLength;
                    userMessage(`Source code too large for URL - not updated (${totalLength} bytes, ${overage} over ${maxUrlLength} limit)`);
                    return;
                }

                //TODO this is not visible/useful? on file:

                newUrl.searchParams.set('asm', encoded);
            }

            // Only attempt history update for protocols that support it
            if (window.location.protocol !== 'file:') {
                try {
                    window.history.replaceState(null, '', newUrl);
                } catch (historyError) {
                    userMessageAboutBug('Failed to update URL history', historyError.message);
                }
            }
        } catch (e) {
            userMessageAboutBug('Failed to update URL', e.message);
        }
    }

    loadFromURL() {
        try {
            if (this.isUrlUpdateDisabled()) {
                return false;
            }

            // Can read URL parameters even from file system, just can't modify them
            const urlParams = new URLSearchParams(window.location.search);
            const encoded = urlParams.get('asm');

            if (encoded) {
                let sourceCode = decodeURIComponent(atob(encoded));
                // Remove first line feed if it's followed by non-blank content
                if (sourceCode.startsWith('\n') && sourceCode.length > 1 && sourceCode[1].trim() !== '') {
                    sourceCode = sourceCode.substring(1);
                }
                document.getElementById('assemblyInput').value = sourceCode;
                return true;
            }
        } catch (e) {
            userMessageAboutBug('Failed to load assembly program from custom URL', e.message);
        }
        return false;
    }


    // Check if URL updates should be disabled
    isUrlUpdateDisabled() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('asm') === 'dont';
    }

    // Stop continuous execution
    stopContinuousExecution() {
        if (this.runLoopId) {
            this.clearTimer(this.runLoopId);
            this.runLoopId = null;
        }
    }

    // Set state and update UI accordingly
    setState(newState) {
        this.state = newState;
        this.renderButtons();

        // Handle state-specific behaviors per README spec
        switch (newState) {
            case STATE.NOT_READY:
                this.stopContinuousExecution();
                break;

            case STATE.FREE_RUNNING:
                // Per README: "Any time the state changes to state_running, the CPU is reset and the assembled program is started"
                this.startContinuousExecution();
                break;

            case STATE.STEPPING:
                this.stopContinuousExecution();
                break;
        }

        // Disable easter egg when entering execution states
        if (newState === STATE.FREE_RUNNING || newState === STATE.STEPPING) {
            this.easterEggEnabled = false;
        }
    }

    // Dynamic button rendering based on current state
    renderButtons() {
        const container = document.getElementById('executionControls');
        container.innerHTML = '';

        switch (this.state) {
            case STATE.NOT_READY:
                container.innerHTML = `
                    <div style="background: #e8f4f8; border: 2px solid #4a90e2; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; color: #2c3e50;">
                        On the top panel, enter assembly code and click "Assemble and Run"
                    </div>
                `;
                // Add click handler to scroll to top when in NOT_READY state
                const notReadyDiv = container.querySelector('div');
                if (notReadyDiv) {
                    notReadyDiv.addEventListener('pointerdown', () => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                }
                break;

            case STATE.FREE_RUNNING:
                container.innerHTML = `
                    <button onclick="sinclaude.breakRequest()">Break</button>
                    <button onclick="sinclaude.resetRequest()">Reset</button>
                    <button id="speedToggle" onclick="sinclaude.toggleSpeed()">${this.fastMode ? '→ Slow' : '→ Fast'}</button>
                `;
                break;

            case STATE.STEPPING:
                container.innerHTML = `
                    <button onclick="sinclaude.stepRequest()">Step</button>
                    <button onclick="sinclaude.resetRequest()">Reset</button>
                    <button onclick="sinclaude.runRequest()">Run</button>
                `;
                break;
        }
    }

    // Handle Reset button click
    resetRequest() {
        this.cpu.reset();
        // Set PC to the program's load address (ORG)
        if (this.loadAddress !== undefined) {
            this.cpu.registers.PC = this.loadAddress;
        }
        this.instructionCount = 0;
        this.updateHardwareDisplay();
        // Clear any animation timers during reset
        this.clearNonEssentialTimers();
    }

    // Clear animation timers but keep essential display/run timers
    clearNonEssentialTimers() {
        // Keep display interval and run loop, clear animation timers
        const essentialTimers = new Set([this.displayUpdateInterval, this.runLoopId]);
        this.activeTimers.forEach(timerId => {
            if (!essentialTimers.has(timerId)) {
                this.clearTimer(timerId);
            }
        });
    }

    setupCleanupHandlers() {
        // Ensure all timers are cleared when page unloads
        window.addEventListener('beforeunload', () => {
            this.clearAllTimers();
        });

        // Also clear on visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clearNonEssentialTimers();
            }
        });
    }

    // Handle Break button click  
    breakRequest() {
        if (this.state === STATE.FREE_RUNNING) {
            this.setState(STATE.STEPPING);
        } else {
            userMessage("Break ignored: not in running state");
        }
    }

    // Handle Run button click
    runRequest() {
        if (this.state === STATE.STEPPING) {
            this.setState(STATE.FREE_RUNNING);
        } else {
            userMessage("Run ignored: not in stepping state");
        }
    }

    startContinuousExecution() {
        if (this.runLoopId !== null) {
            userMessageAboutBug("Already running - ignoring request", "startContinuousExecution called while runLoopId != null");
            return;
        }

        // Check if assembly is loaded
        if (this.state === STATE.NOT_READY) {
            userMessage('Please assemble code first before starting execution.');
            return;
        }

        this.mipsLastUpdate = performance.now();
        this.mipsInstructionCount = this.instructionCount;
        this.runLoop();
    }

    runLoop() {
        if (this.state !== STATE.FREE_RUNNING) return;

        const endTime = performance.now() + 1000 / FPS / 2;
        // at 1 mips, 1/60 of a second is 16,000 instructions
        const batchSize = 10000;
        while (performance.now() < endTime) {
            const result = this.cpu.execute(this.memory, batchSize, this.cpu.registers);
            this.instructionCount += result.instructionsExecuted;
            if (result.error) {
                userMessageAboutBug('CPU error during run', `${result.error}`);
                return;
            }

            if (result.halted) {
                userMessage('CPU halted - switched to stepping mode');
                this.setState(STATE.STEPPING);
                return;
            }
        }
        // Schedule next execution cycle immediately 
        this.runLoopId = this.createTimer(() => this.runLoop(), 1, false);
    }

    updateMIPS() {
        if (this.state !== STATE.FREE_RUNNING) {
            this.mipsValue = "-";
            return;
        }

        const currentTime = performance.now();
        const timeElapsed = (currentTime - this.mipsLastUpdate) / 1000;
        let instructionsExecuted = this.instructionCount - this.mipsInstructionCount;
        if (instructionsExecuted < 0) instructionsExecuted = 0;

        const instantMips = (instructionsExecuted / timeElapsed) / one_million;

        // Calculate k so that the MIPS decays to 1/e in 1 second
        // k = 1 - exp(-timeElapsed / tau), tau = 1s
        const tau = 1.0;
        const k = 1 - Math.exp(-timeElapsed / tau);

        if (this.mipsValue === "-") {
            this.mipsValue = instantMips;
        } else {
            this.mipsValue = k * instantMips + (1 - k) * this.mipsValue;
        }

        this.mipsLastUpdate = currentTime;
        this.mipsInstructionCount = this.instructionCount;
    }

    stepRequest() {
        if (this.state === STATE.NOT_READY) {
            userMessage('Please assemble code first before stepping through execution.');
            return;
        }

        if (this.state === STATE.FREE_RUNNING) {
            userMessageAboutBug("Use Break button to switch to stepping mode", "stepRequest() called while state === STATE.FREE_RUNNING");
            return;
        } else if (this.state === STATE.STEPPING) {
            // Execute one instruction in stepping mode
            this.executeOneInstruction();
        }
    }

    executeOneInstruction() {
        const result = this.cpu.execute(this.memory, 1, this.cpu.registers);
        this.instructionCount += result.instructionsExecuted;
        this.updateHardwareDisplay();

        if (result.error) {
            userMessageAboutBug('CPU error during step', `${result.error}`);
        }

        // CPU halted in stepping mode - no message needed (user stepped into HALT)

        // Stay in stepping state as per README specification
    }

    expandElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Find the expansion handler for this element
        const expandedElements = document.querySelectorAll('.expanded-element');
        const isAlreadyExpanded = Array.from(expandedElements).some(el => el.id === elementId);
        
        if (isAlreadyExpanded) {
            // Element is already expanded, restore it
            this.restoreElement(elementId);
        } else {
            // Expand the element
            this.performExpansion(element);
        }
    }

    performExpansion(element) {
        // Store original styles
        const originalStyles = {
            position: element.style.position || '',
            top: element.style.top || '',
            left: element.style.left || '',
            width: element.style.width || '',
            height: element.style.height || '',
            zIndex: element.style.zIndex || ''
        };
        element.dataset.originalStyles = JSON.stringify(originalStyles);

        // Create and show restore note
        const restoreNote = document.createElement('div');
        restoreNote.id = 'expandRestoreNote';
        restoreNote.textContent = 'Touch to restore size';
        restoreNote.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 5vh;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            text-align: center;
            z-index: ${Z_INDEX.RESTORE_MESSAGE};
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        restoreNote.addEventListener('pointerdown', () => this.restoreElement(element.id));
        document.body.appendChild(restoreNote);

        // Expand to 95% width/height with 5% top margin
        element.style.position = 'fixed';
        element.style.top = '5vh';
        element.style.left = '2.5vw';
        element.style.width = '95vw';
        element.style.height = '95vh';
        element.style.zIndex = Z_INDEX.EXPANDED_ELEMENT;
        element.style.fontSize = '16px';
        element.classList.add('expanded-element');
    }

    restoreElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Restore original styles
        const originalStyles = JSON.parse(element.dataset.originalStyles || '{}');
        Object.keys(originalStyles).forEach(key => {
            element.style[key] = originalStyles[key];
        });
        
        // Remove restore note
        const restoreNote = document.getElementById('expandRestoreNote');
        if (restoreNote) {
            restoreNote.remove();
        }
        
        element.classList.remove('expanded-element');
        delete element.dataset.originalStyles;
    }
}

window.buttonEditMode = false;

function toggleButtonEdit() {
    window.buttonEditMode = !window.buttonEditMode;
    const toggle = document.querySelector('.edit-toggle');
    const gameButtons = document.querySelectorAll('.game-buttons button');
    
    if (window.buttonEditMode) {
        toggle.textContent = 'Click here to end customization';
        toggle.classList.add('active'); 
        gameButtons.forEach(button => button.classList.add('edit-mode'));
    } else {
        toggle.textContent = 'Click here to customize button keys';
        toggle.classList.remove('active');
        gameButtons.forEach(button => button.classList.remove('edit-mode'));
    }
}
