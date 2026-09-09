const SCREEN_START = 60000;
const SCREEN_WIDTH = 32;
const SCREEN_HEIGHT = 24;
const MEMORY_SIZE = 65536;
const FRAME_COUNT_PORT = 0;
const KEYBOARD_PORT = 1;
const KBD_NO_KEY_PRESSED = -1;
const BEEP_10HZ_PORT = 2;
const BEEP_DURATION_PORT = 3;
const BEEP_VOLUME_PORT = 4;
const BEEP_DEFAULT_VOLUME = 85;

const MAX_URL_LENGTH = 2000; // supposed to be 32K but erring at a lot less
const BEEP_GAIN = 0.1;
const BUTTON_EDIT_FOCUS_DELAY_MS = 10;

// Sinclair block characters that should not use retro font
const sinclairBlockChars = [6, 8, 9, 13, 14, 16, 17, 18, 19, 20, 21, 22];

// Keys a game button can be named after. sinclairCode is the keyboard-port value for
// keys without a printable character; null means the key goes through unicodeToSinclair.
const SPECIAL_KEYS = [
  { keyCode: 32, name: "Space", sinclairCode: null },
  { keyCode: 27, name: "Escape", sinclairCode: 12 },
  { keyCode: 38, name: "ArrowUp", sinclairCode: 145 },
  { keyCode: 40, name: "ArrowDown", sinclairCode: 147 },
  { keyCode: 37, name: "ArrowLeft", sinclairCode: 144 },
  { keyCode: 39, name: "ArrowRight", sinclairCode: 146 },
  { keyCode: 13, name: "Enter", sinclairCode: 13 },
  { keyCode: 9, name: "Tab", sinclairCode: null },
];

class Simulator {
  constructor() {
    this.cpu = new Z80CPU();
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.ioMap = new Uint8Array(256);
    this.resetBeepPorts();
    this.setState(STATE.NOT_READY);
    this.instructionCount = 0;
    this.mipsValue = 0.0;
    this.refreshRate = 0.0;
    this.lastRefreshTime = performance.now();
    this.refreshCount = 0;
    this.mipsLastUpdate = performance.now();
    this.mipsInstructionCount = 0;
    this.keyCodeCurrent = null; // null = no key ever pressed; display shows "--"
    this.keyCodeCurrentReleased = true;
    this.runLoopInterval = null;
    this.fastMode = false;
    this.isBootSequenceRunning = false;

    // Line highlighting for stepping
    this.instructionDetails = [];
    this.highlightedPC = null;
    this.lastPC = null;

    // Screen optimization tracking; an empty screenElements array forces a full rebuild
    this.lastScreenState = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.screenElements = [];

    // Timer management
    this.activeTimers = new Set();
    this.displayUpdateInterval = null;

    // Beep functionality
    this.audioContext = null;

    // Sinclair byte <-> Unicode char
    this.initializeCharacterMappings();
    this.initializeKeyMappings();

    // Button lifecycle state tracking
    this.lastIsAssemblyAreaClear = null;
    this.buttonEditMode = false;

    this.useSinclairFont =
      localStorage.getItem(LOCALSTORAGE_RETRO_FONTS_KEY) !== "false";

    this.setupDOM();
    this.setupKeyboard();
    this.setupDisplayUpdates();
    this.initializeVersionChecking();
    this.setupCleanupHandlers();
    this.bootShow();
  }

  initializeCharacterMappings() {
    // Spectrum character 0-127 to Unicode
    const sinclairByteToUnicode = [
      // 0-31: Mix of undefined and block graphics
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "▌",
      "⸮",
      "▄",
      "▖",
      "⸮",
      "⸮",
      "⸮",
      "▗",
      "▝",
      "⸮",
      "▐",
      "▞",
      "▚",
      "▟",
      "▙",
      "▀",
      "▛",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      "⸮",
      // 32-63: Space, punctuation, numbers
      " ",
      "!",
      '"',
      "#",
      "$",
      "%",
      "&",
      "'",
      "(",
      ")",
      "*",
      "+",
      ",",
      "-",
      ".",
      "/",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      ":",
      ";",
      "<",
      "=",
      ">",
      "?",
      // 64-95: @, A-Z, punctuation
      "@",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "[",
      "\\",
      "]",
      "↑", // not ^
      "_",
      // 96-127: £, a-z, symbols
      "£", // not `
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
      "{",
      "|",
      "}",
      "~",
      "©", // not DEL
    ];

    // Bytes 128-255 are the inverted forms of 0-127 (same glyph), so the
    // 128-entry table is indexed with the top bit masked off
    this.sinclairByteToUnicode = sinclairByteToUnicode;

    // Build reverse lookup map (Unicode char -> Sinclair byte) for O(1) conversion
    this.unicodeToSinclairMap = new Map();
    sinclairByteToUnicode.forEach((char, byte) => {
      if (!this.unicodeToSinclairMap.has(char)) {
        this.unicodeToSinclairMap.set(char, byte);
      }
    });
  }

  setupDOM() {
    // Get DOM elements
    this.screen = document.getElementById("screen");
    this.keyCodeCurrentDisplay = document.getElementById("keyCodeCurrent");
    this.pcDisplay = document.getElementById("regPC");
    this.spDisplay = document.getElementById("regSP");
    this.stackContentsDisplay = document.getElementById("stackContents");
    this.regADisplay = document.getElementById("regA");
    this.regBCDisplay = document.getElementById("regBC");
    this.regDEDisplay = document.getElementById("regDE");
    this.regHLDisplay = document.getElementById("regHL");
    this.flagCDisplay = document.getElementById("flagC");
    this.flagZDisplay = document.getElementById("flagZ");
    this.currentInstructionDisplay =
      document.getElementById("currentInstruction");
    this.refreshRateDisplay = document.getElementById("refreshRate");
    this.mipsDisplay = document.getElementById("mips");
    this.portsDisplay = document.getElementById("ports");

    // Assembly editor elements
    this.assemblyEditor = document.getElementById("assemblyEditor");
    this.addressColumn = document.getElementById("addressColumn");
    this.opcodesColumn = document.getElementById("opcodesColumn");
    this.assemblyColumn = document.getElementById("assemblyColumn");

    // Collapsible sections
    this.assemblySection = document.querySelector(".assembly-section");
    this.listingSection = document.querySelector(".listing-section");
    this.consoleSection = document.querySelector(".console-section");

    // Generate program buttons and key inputs
    this.createGameButtons();

    // Setup assembly editor
    this.setupAssemblyEditor();

    this.setupCollapsibleSection(this.listingSection);
    this.setupCollapsibleSection(this.consoleSection);

    this.applyButtonEditMode(false);
  }

  setupAssemblyEditor() {
    // Keep the three columns scrolled together
    const columns = [
      this.addressColumn,
      this.opcodesColumn,
      this.assemblyColumn,
    ];
    columns.forEach((column) => {
      column.addEventListener("scroll", () => {
        columns.forEach((other) => {
          if (other !== column) {
            other.scrollTop = column.scrollTop;
          }
        });
      });
    });

    // Handle input in the assembly column
    this.assemblyColumn.addEventListener("input", () => {
      // Hide columns when user starts editing
      this.hideAddressOpcodesColumns();
    });

    // Handle paste events to ensure proper formatting
    this.assemblyColumn.addEventListener("paste", (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData("text");
      this.insertTextAtCursor(paste);
      // Hide columns when user pastes content
      this.hideAddressOpcodesColumns();
    });

    // Tab and Enter are inserted as plain text so the contenteditable keeps
    // its line structure; every other key edits natively and fires "input"
    const keyInserts = new Map([
      ["Tab", "  "], // 2 spaces for tab; let's skimp; we got 32 total
      ["Enter", "\n"],
    ]);
    this.assemblyColumn.addEventListener("keydown", (e) => {
      const insertedText = keyInserts.get(e.key);
      if (insertedText !== undefined) {
        e.preventDefault();
        this.insertTextAtCursor(insertedText);
        this.hideAddressOpcodesColumns();
      }
    });
  }

  setupAssemblyContentObserver() {
    if (!this.isNarrowViewport()) {
      return; // Skip observer setup on full viewports - buttons stay visible
    }

    // Watch for content changes in the assembly area; the observe options
    // below already limit callbacks to childList and characterData mutations
    this.assemblyObserver = new MutationObserver(() => {
      this.updateButtonVisibility();
    });

    this.assemblyObserver.observe(this.assemblyColumn, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // The program loaded before the observer existed does not fire it
    this.updateButtonVisibility();
  }

  // Helper method to check if we're on a narrow viewport that needs dynamic buttons
  isNarrowViewport() {
    return window.innerWidth <= BREAKPOINTS.MOBILE_MAX;
  }

  setupCollapsibleSection(section) {
    section.querySelector("h3").addEventListener("click", () => {
      section.classList.toggle("collapsed");
    });
  }

  insertTextAtCursor(text) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  getAssemblyCode() {
    return this.assemblyColumn.textContent;
  }

  setAssemblyCode(code) {
    // Always set as plain text to avoid HTML issues
    this.assemblyColumn.textContent = code;
    this.updateAddressAndOpcodesColumns();
  }

  updateAddressAndOpcodesColumns() {
    const lines = this.getAssemblyCode().split("\n");
    const addressLines = [];
    const opcodeLines = [];

    lines.forEach((_line, index) => {
      const details = this.instructionDetails[index];
      if (details) {
        const hexAddr =
          details.startAddress !== null
            ? formatHex4(details.startAddress)
            : "----";
        const opcodeString = details.opcodes
          .map((byte) => formatHex2(byte))
          .join("")
          .padEnd(8, " ");

        addressLines.push(hexAddr);
        opcodeLines.push(opcodeString);
      } else {
        addressLines.push("----");
        opcodeLines.push("        ");
      }
    });

    this.addressColumn.textContent = addressLines.join("\n");
    this.opcodesColumn.textContent = opcodeLines.join("\n");
  }

  clearAddressAndOpcodesColumns() {
    this.addressColumn.textContent = "";
    this.opcodesColumn.textContent = "";
  }

  showAddressOpcodesColumns() {
    this.assemblyEditor.classList.add("show-address-opcodes");
  }

  hideAddressOpcodesColumns() {
    this.assemblyEditor.classList.remove("show-address-opcodes");
  }

  createGameButtons() {
    const gameButtonsDiv = document.getElementById("gameButtons");
    const defaultKeys = ["W", "S", "Space", "A", "D"];

    // Clear existing content
    gameButtonsDiv.innerHTML = "";

    // Create program buttons with key names as text
    defaultKeys.forEach((defaultKey) => {
      const button = document.createElement("button");
      button.textContent = defaultKey;
      button.tabIndex = 0; // Make button focusable when clicked

      // Add event listeners for both game functionality and edit mode
      button.addEventListener("pointerdown", (e) => {
        this.handleButtonClick(button);
        e.preventDefault();
      });
      button.addEventListener("pointerup", (e) => {
        if (!this.buttonEditMode) {
          this.releaseKey();
        }
        e.preventDefault();
      });

      gameButtonsDiv.appendChild(button);
    });
  }

  handleButtonClick(button) {
    if (this.buttonEditMode) {
      this.editButtonText(button);
    } else {
      this.buttonClick(button);
    }
  }

  editButtonText(button) {
    const text = button.textContent;
    const input = document.createElement("input");
    input.className = "edit-input";
    input.type = "text";
    input.value = text;
    // Set maxLength to the longest key name in keyCodeToKeyName
    input.maxLength = Math.max(
      ...Array.from(this.keyCodeToKeyName.values()).map((name) => name.length)
    );
    button.innerHTML = "";
    button.appendChild(input);

    // Small delay to ensure proper focus
    setTimeout(() => {
      input.focus();
      input.select();
    }, BUTTON_EDIT_FOCUS_DELAY_MS);

    const finishEdit = () => {
      const typedCaption = input.value.trim();

      // Validate the key name
      const readableLabel = this.toReadableKeyLabel(typedCaption);
      let finalText;

      if (readableLabel) {
        finalText = readableLabel;
      } else if (typedCaption === "") {
        // Empty input - keep original text
        finalText = text;
      } else {
        // Invalid input - show message and keep original text
        userMessage(
          `Invalid key configuration "${typedCaption}" - reset to previous value`
        );
        finalText = text;
      }

      button.innerHTML = finalText;
    };

    input.addEventListener("blur", finishEdit);
  }

  setupKeyboard() {
    /*
            ### Keyboard Processing Pipeline (Example: Escape Key)
    
            **Direct Keyboard Input:**
            1. **Key Press** to `keydown` event handler calls `setKey(27)` directly.
            2. **Special Handling** → `setKey(27)` maps 27 → 12 (Sinclair ESC code).
            3. **Memory Poke** → `OutPort()` writes 12 to address KEYBOARD_PORT.
    
            **Programmable Button Input:**
            1. **User Configuration** → User types "Escape" in a button's textbox.
            2. **Button Click** → `buttonClick()` reads "Escape" from the button's caption.
            3. **Code Conversion** → `labelToKeyCodeOrNull("Escape")` returns 27.
            4. **Special Handling** → `setKey(27)` maps 27 → 12 (Sinclair ESC code).
            5. **Memory Poke** → `OutPort()` writes 12 to address KEYBOARD_PORT.
    
            **Keyboard Capture Activation:**
            - **Hover**: Activated when the `.execution-section` is hovered.
            - **Focus**: Activated when the `.execution-section` gains focus (e.g., via tabbing).
            - **Touch**: Activated when the `.execution-section` is touched on mobile devices.
    
            **Keyboard Capture Deactivation:**
            - **Mouse Leave**: Deactivated when the `.execution-section` is no longer hovered.
            - **Blur**: Deactivated when the `.execution-section` loses focus.
            - **Outside Touch**: Deactivated when a touch occurs outside the `.execution-section`.
            */

    const executionSection = document.querySelector(".execution-section");
    if (!executionSection) {
      userMessageAboutBug(
        "Keyboard setup failed - execution section not found",
        "setupKeyboard() called but .execution-section element not found in DOM"
      );
      return;
    }

    // Make the execution section focusable
    executionSection.tabIndex = 0;

    const keyboardStatus = document.getElementById("keyboardStatus");
    this.keyboardCaptureActive = false;

    const KBD_NOT_CAPTURED_MSG =
      "Hover this area for key presses to be sent to Sinclaude";
    const KBD_CAPTURED_MSG =
      "This area is now sending key presses to Sinclaude";

    const renderKeyboardStatus = () => {
      keyboardStatus.textContent = this.keyboardCaptureActive
        ? KBD_CAPTURED_MSG
        : KBD_NOT_CAPTURED_MSG;
      keyboardStatus.classList.toggle(
        "get-attention",
        !this.keyboardCaptureActive
      );
    };

    const activateCapture = () => {
      this.keyboardCaptureActive = true;
      renderKeyboardStatus();
    };

    // Releasing the held key on deactivation is required, not a bug. Once capture
    // deactivates, keyup events are no longer processed, so an unreleased key would
    // stay stuck. Early release on an outside tap (even mid-game on multi-touch)
    // is the lesser evil.
    const deactivateCapture = () => {
      this.keyboardCaptureActive = false;
      renderKeyboardStatus();
      this.setKey(KBD_NO_KEY_PRESSED);
    };

    // Set initial state
    renderKeyboardStatus();

    // Desktop: Hover-based keyboard capture
    executionSection.addEventListener("mouseenter", activateCapture);
    executionSection.addEventListener("mouseleave", deactivateCapture);
    executionSection.addEventListener("focus", activateCapture);
    executionSection.addEventListener("blur", deactivateCapture);

    // Mobile: Touch-based keyboard capture
    executionSection.addEventListener("pointerdown", activateCapture);

    // Document-level touch to detect touches outside execution section
    document.addEventListener("pointerdown", (e) => {
      if (!executionSection.contains(e.target)) {
        deactivateCapture();
      }
    });

    // Don't capture keyboard input when user is typing in input boxes or textareas
    const isTypingInFormField = (e) =>
      e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";

    // Document-level keyboard capture - only process when capture is active
    document.addEventListener("keydown", (e) => {
      if (this.keyboardCaptureActive && !isTypingInFormField(e)) {
        this.setKey(e.keyCode || e.which);
        e.preventDefault(); // Prevent default browser behavior
      }
    });

    document.addEventListener("keyup", (e) => {
      if (this.keyboardCaptureActive && !isTypingInFormField(e)) {
        this.setKey(KBD_NO_KEY_PRESSED);
        e.preventDefault();
      }
    });
  }

  initializeKeyMappings() {
    // Pre-populate bidirectional mapping for special keys only
    this.keyCodeToKeyName = new Map(
      SPECIAL_KEYS.map((key) => [key.keyCode, key.name])
    );
    // lowercase for easier find
    this.lcKeyNameToKeyCode = new Map(
      SPECIAL_KEYS.map((key) => [key.name.toLowerCase(), key.keyCode])
    );
    this.keyCodeToSinclairCode = new Map(
      SPECIAL_KEYS.filter((key) => key.sinclairCode !== null).map((key) => [
        key.keyCode,
        key.sinclairCode,
      ])
    );
  }

  toReadableKeyLabel(typedCaption) {
    if (!typedCaption || typeof typedCaption !== "string") {
      return null;
    }
    // Normalize input to lowercase
    const lcTypedCaption = typedCaption.toLowerCase();

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
    if (!label || typeof label !== "string") {
      return null;
    }

    // Try to get keyCode from mapping
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

  buttonClick(button) {
    // The button caption names the key to press
    const value = button.textContent.trim();

    const keyCodeOrNull = this.labelToKeyCodeOrNull(value);

    if (keyCodeOrNull !== null) {
      this.setKey(keyCodeOrNull);
    } else {
      userMessageAboutBug(
        "Cannot press key",
        `Invalid configuration "${value}"`
      );
    }
  }

  releaseKey() {
    // Release key (send no-key value)
    this.setKey(KBD_NO_KEY_PRESSED);
  }

  OutPort(port, value) {
    this.ioMap[port] = value;
  }

  resetBeepPorts() {
    // Older programs never write volume, so a new run must not inherit mute
    // or a composition's last note level from the previous program.
    this.OutPort(BEEP_10HZ_PORT, 0);
    this.OutPort(BEEP_DURATION_PORT, 0);
    this.OutPort(BEEP_VOLUME_PORT, BEEP_DEFAULT_VOLUME);
  }

  handleBeepPortChange() {
    const beepHz = this.ioMap[BEEP_10HZ_PORT] * 10;
    const beepMs = decodeBeepDuration(this.ioMap[BEEP_DURATION_PORT]);

    // Consume muted requests too, while retaining volume for the next note.
    if (beepHz > 0 && beepMs > 0) {
      this.playBeep(beepHz, beepMs, this.ioMap[BEEP_VOLUME_PORT]);
      this.OutPort(BEEP_10HZ_PORT, 0);
      this.OutPort(BEEP_DURATION_PORT, 0);
    }
  }

  playBeep(frequency, duration, volume = BEEP_DEFAULT_VOLUME) {
    // A muted request needs no oscillator, but the caller still clears it.
    if (duration === 0 || volume === 0 || !this.audioContext) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    gain.gain.value = BEEP_GAIN * (volume / 255);
    oscillator.frequency.value = frequency;
    oscillator.start();

    // Let each sound play independently without stopping previous ones
    setTimeout(() => {
      try {
        oscillator.stop();
      } catch (e) {
        // Oscillator might already be stopped
      }
    }, duration);
  }

  InPort(port) {
    return this.ioMap[port];
  }

  setKey(keyCode) {
    this.keyCodeCurrentReleased = keyCode === KBD_NO_KEY_PRESSED;
    if (!this.keyCodeCurrentReleased) {
      this.keyCodeCurrent = keyCode;
    }

    if (keyCode === KBD_NO_KEY_PRESSED) {
      this.OutPort(KEYBOARD_PORT, KBD_NO_KEY_PRESSED & 0xff); // no-key
    } else if (this.keyCodeToSinclairCode.has(keyCode)) {
      this.OutPort(KEYBOARD_PORT, this.keyCodeToSinclairCode.get(keyCode));
    } else {
      const sinclairCode = this.unicodeToSinclair(String.fromCharCode(keyCode));
      this.OutPort(KEYBOARD_PORT, sinclairCode);
    }
  }

  bootShow() {
    // Define stage configuration (stage function, duration in ms before start the next one)
    // duration -1 means last one
    this.stageConfig = [
      { run: () => this.displayCharacterGrid(), duration: 1000 },
      { run: () => this.benchmarkCPU(), duration: 1000 },
      { run: () => this.showSinclairCopyright(), duration: 1 },
      { run: () => this.reportInstructionSetAnalysis(), duration: 1 },
      { run: () => this.runAssemblerTests(), duration: 1 },
      { run: () => this.runZ80CPUTests(), duration: -1 },
    ];

    // Mark boot sequence as running
    this.isBootSequenceRunning = true;

    // A tap on the screen cancels the boot sequence
    this.setScreenPointerHandler(() => {
      if (this.isBootSequenceRunning) {
        this.cancelBootSequence();
      }
    });

    // Start the transition chain
    this.startStage(0);
  }

  startStage(stageIndex) {
    // Check if boot sequence was cancelled
    if (!this.isBootSequenceRunning) {
      return;
    }

    // Validate stage index
    const stage = this.stageConfig[stageIndex];
    if (!stage) {
      userMessageAboutBug(
        "Unknown stage index",
        `startStage(${stageIndex}) called with unknown index`
      );
      return;
    }

    // Clean up any previous stage timers
    if (this.currentStageTimer) {
      this.clearTimer(this.currentStageTimer);
      this.currentStageTimer = null;
    }

    stage.run();

    // Schedule next stage if duration is set and there's a next stage
    if (stage.duration > 0 && stageIndex + 1 < this.stageConfig.length) {
      this.currentStageTimer = this.createTimer(
        () => {
          this.startStage(stageIndex + 1);
        },
        stage.duration,
        false
      );
    } else if (stage.duration === -1) {
      this.finishBootSequence();
    }
  }

  // Cancelling and completing both end in the same state: boot over, screen taps ignored.
  // Setting isBootSequenceRunning false also stops startStage from continuing.
  finishBootSequence() {
    this.isBootSequenceRunning = false;
    this.setScreenPointerHandler(null);
  }

  cancelBootSequence() {
    this.finishBootSequence();
    userMessage("Boot sequence cancelled");
  }

  // The screen has at most one pointer action at a time: cancel boot, then none
  setScreenPointerHandler(handler) {
    if (this.screenPointerHandler) {
      this.screen.removeEventListener("pointerdown", this.screenPointerHandler);
    }
    this.screenPointerHandler = handler;
    if (handler) {
      this.screen.addEventListener("pointerdown", handler);
    }
  }

  benchmarkCPU() {
    // Infinite loop; JR is not significantly faster; NOP seems to be but not worth the noise
    this.benchmarkProgram("ORG 0\nJP 0");
    
  }

  benchmarkProgram(assemblyCode) {
    const assembler = new Z80Assembler();
    const assemble = assembler.assemble(assemblyCode);

    if (assemble.success) {
      const benchMemory = new Uint8Array(MEMORY_SIZE);
      Z80Assembler.loadOpcodesIntoMemory(
        benchMemory,
        assemble.instructionDetails
      );

      const benchCPU = new Z80CPU();
      const benchIomap = new Uint8Array(256);

      const worst_mips = 0.5; // Experimental worst case MIPS performance
      const target_sec = 0.5; // Target execution time in seconds
      const minimum_sec = (1 / 60) * 10; // Minimum execution time for accurate measurement given aprox OS jitter
      let instructions = worst_mips * one_million * target_sec; // Convert MIPS to instructions

      const runBenchmark = (instructionCount) => {
        const startTime = performance.now();
        const benchResult = benchCPU.executeSteps(
          benchMemory,
          benchIomap,
          instructionCount
        );
        const endTime = performance.now();
        const elapsedSeconds = (endTime - startTime) / 1000;
        return { benchResult, elapsedSeconds };
      };

      let benchmarkResult;

      // get enough accuracy
      while (true) {
        benchmarkResult = runBenchmark(instructions);
        if (benchmarkResult.elapsedSeconds >= minimum_sec) break;
        instructions *= 2;
      }

      // If we're below target_sec, repeat this until it reaches target because it seems JIC might be preventing it reaching it one pass
      if (benchmarkResult.elapsedSeconds < target_sec) {
        instructions *= target_sec / benchmarkResult.elapsedSeconds;
        benchmarkResult = runBenchmark(instructions);
      }

      const MIPS =
        benchmarkResult.benchResult.instructionsExecuted /
        benchmarkResult.elapsedSeconds /
        one_million;

      userMessage(
        `CPU Benchmark: ${benchmarkResult.benchResult.instructionsExecuted.toLocaleString()} instructions in ${benchmarkResult.elapsedSeconds.toFixed(3)}s running "${assemblyCode.replace(/\n/g, "\\n")}" = ${MIPS.toFixed(1)} MIPS`
      );
    } else {
      userMessageAboutBug("Benchmark assembly failed", assemble.error);
    }
  }

  screenAddress(row, col) {
    return SCREEN_START + row * SCREEN_WIDTH + col;
  }

  displayTextAtPosition(text, row, col) {
    const addr = this.screenAddress(row, col);
    for (let i = 0; i < text.length && col + i < SCREEN_WIDTH; i++) {
      this.memory[addr + i] = this.unicodeToSinclair(text[i]);
    }
  }

  displayTextCentered(text, row) {
    const padding = Math.floor((SCREEN_WIDTH - text.length) / 2);
    this.displayTextAtPosition(text, row, padding);
  }

  clearScreen() {
    // Fill entire screen with spaces
    this.memory.fill(
      this.unicodeToSinclair(" "),
      SCREEN_START,
      SCREEN_START + SCREEN_WIDTH * SCREEN_HEIGHT
    );
  }

  displayCharacterGrid() {
    // Display characters 0-255 with format: "00:XXXX 04:XXXX 08:XXXX 0C:XXXX"

    this.clearScreen();
    this.displayTextCentered("CHARACTER SET TEST", 0);
    this.displayTextCentered("-".repeat(SCREEN_WIDTH), 1);
    // Start character display from line 2 (index 1)
    let currentLine = 2;

    // Display all 256 characters across remaining lines (22 lines available)
    // We can fit 16 characters per line with format "00:XXXX 04:XXXX 08:XXXX 0C:XXXX"
    // This gives us exactly 16 lines for 256 characters (256/16 = 16)
    for (
      let charCode = 0;
      charCode < 256 && currentLine < SCREEN_HEIGHT;
      charCode += 16
    ) {
      let screenCol = 0;

      // 4 groups of 4 characters each
      for (let group = 0; group < 4 && screenCol < SCREEN_WIDTH - 6; group++) {
        const groupStartCode = charCode + group * 4;
        if (groupStartCode >= 256) break;

        const screenAddr = this.screenAddress(currentLine, screenCol);

        // Write starting hex code (2 chars)
        const startCodeStr = formatHex2(groupStartCode);
        this.memory[screenAddr] = this.unicodeToSinclair(startCodeStr[0]);
        this.memory[screenAddr + 1] = this.unicodeToSinclair(startCodeStr[1]);

        // Write colon
        this.memory[screenAddr + 2] = this.unicodeToSinclair(":");

        // Write 4 characters
        for (let i = 0; i < 4; i++) {
          const code = groupStartCode + i;
          if (code < 256) {
            this.memory[screenAddr + 3 + i] = code;
          }
        }
        screenCol += 7; // 2 hex + colon + 4 chars = 7
        this.memory[this.screenAddress(currentLine, screenCol)] =
          this.unicodeToSinclair(" ");
        screenCol++;
      }
      currentLine++;
    }

    // Fill remaining lines with Line n up to 23
    for (; currentLine < SCREEN_HEIGHT; currentLine++) {
      this.displayTextAtPosition(`Line ${currentLine}`, currentLine, 0);
    }
  }

  showSinclairCopyright() {
    this.clearScreen();

    // a-historic
    this.displayTextCentered("(C) 1981 SINCLAIR RESEARCH", SCREEN_HEIGHT - 1);
  }

  // Reports inconsistencies in the assembler's instruction table
  reportInstructionSetAnalysis() {
    try {
      const analysis = new Z80Assembler().getInstructionSetAnalysis();

      if (analysis.duplicateMnemonicOperands.length > 0) {
        userMessageAboutBug(
          "Assembler table has duplicate mnemonic/operand combinations",
          analysis.duplicateMnemonicOperands.join(", ")
        );
      }

      if (analysis.duplicateOpcodes.length > 0) {
        userMessageAboutBug(
          "Assembler table has duplicate opcodes",
          analysis.duplicateOpcodes.join(", ")
        );
      }

      if (analysis.missingSingleBytes.length > 0) {
        consoleLogApproved(
          `Single-byte opcodes not implemented: ${analysis.missingSingleBytes.length}`
        );
      }
    } catch (error) {
      userMessageAboutBug("Instruction set analysis failed", error.message);
    }
  }

  // Runs a test suite in the page: progress lines are dropped, failures go to the on-page console
  runTestSuite(TestClass, label) {
    try {
      const suite = new TestClass({
        log: () => {},
        fail: (message) => userMessage(message),
      });
      suite.runAllTests();

      // Report summary to user console
      userMessage(
        `${label}: ${suite.passedCount} passed, ${suite.failedTests.length} failed`
      );
    } catch (error) {
      userMessageAboutBug(`${label} error`, error.message);
    }
  }

  runAssemblerTests() {
    this.runTestSuite(Z80AssemblerTestClass, "Assembler Tests");
  }

  runZ80CPUTests() {
    this.runTestSuite(Z80CPUEmulatorTestClass, "Z80 CPU Tests");
  }

  toggleSpeed() {
    this.fastMode = !this.fastMode;
    const toggleButton = document.getElementById("speedToggle");
    if (toggleButton) {
      toggleButton.textContent = this.getSpeedToggleLabel();
      toggleButton.title = this.getSpeedToggleTitle();
    }
  }
  
  getSpeedToggleLabel() {
    return this.fastMode ? "→ SLOW" : "→ FAST";
  }

  getSpeedToggleTitle() {
    return "Toggles screen rendering only. On the ZX-81 this gave ~300% speedup; in Sinclaude it has almost no performance effect.";
  }

  getResetButtonTitle() {
    return "Resets CPU: sets Program Counter (PC) to the program's load address and resets the Stack Pointer (SP).";
  }

  getBreakButtonTitle() {
    return "Pauses execution and switches to single-step mode for debugging.";
  }

  getStepButtonTitle() {
    return "Executes a single instruction and shows the result. Use for debugging and learning how assembly works.";
  }

  getRunButtonTitle() {
    return "Resumes continuous execution from the current position.";
  }
  // Timer management methods
  createTimer(callback, interval, isInterval) {
    const timerId = isInterval
      ? setInterval(callback, interval)
      : setTimeout(callback, interval);
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
    this.activeTimers.forEach((timerId) => this.clearTimer(timerId));
    this.displayUpdateInterval = null;

    // Clean up version checker timers
    if (window.versionChecker) {
      window.versionChecker.cleanup();
    }
  }

  initializeVersionChecking() {
    // Initialize the global version checker with timer management
    if (window.versionChecker) {
      window.versionChecker.init({
        createTimer: (callback, interval, isInterval) =>
          this.createTimer(callback, interval, isInterval),
        clearTimer: (timerId) => this.clearTimer(timerId),
      });
    }
  }

  setupDisplayUpdates() {
    // Clear any existing display interval
    if (this.displayUpdateInterval) {
      this.clearTimer(this.displayUpdateInterval);
    }

    this.displayUpdateInterval = this.createTimer(
      () => {
        if (!this.fastMode) {
          this.updateScreen();
        } else if (this.screenElements.length !== 0) {
          // In fast mode, make screen black once; the empty cache rebuilds it on exit
          this.screen.textContent = "";
          this.screenElements = [];
        }
        this.updateRefreshRate();
        this.updateHardwareDisplay();
        this.updateMIPS();

        // Increment FRAME_COUNT_PORT on each frame
        const currentCount = this.InPort(FRAME_COUNT_PORT);
        this.OutPort(FRAME_COUNT_PORT, (currentCount + 1) & 0xff);
      },
      1000 / FPS,
      true
    );
  }

  updateScreen() {
    // Initialize screen elements cache if needed; this also primes lastScreenState
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

  invalidateScreenCache() {
    // Force a full rebuild on the next frame (font change affects every cell)
    this.screenElements = [];
  }

  initializeScreenElements() {
    // Clear existing content
    this.screen.innerHTML = "";
    this.screenElements = [];

    // Create individual character divs for precise grid positioning
    for (let line = 0; line < SCREEN_HEIGHT; line++) {
      for (let col = 0; col < SCREEN_WIDTH; col++) {
        const charDiv = document.createElement("div");
        charDiv.className = "screen-char";
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

    element.textContent = this.sinclairToUnicode(byte);
    element.classList.toggle("inverted", byte >= 128);
    element.classList.toggle(
      "sinclair-font",
      this.useSinclairFont && !sinclairBlockChars.includes(byte)
    );
  }

  updateRefreshRate() {
    const currentTime = performance.now();
    const secondsElapsed = (currentTime - this.lastRefreshTime) / 1000;
    this.refreshCount++;

    if (secondsElapsed >= 1.0) {
      this.refreshRate = this.refreshCount / secondsElapsed;
      this.refreshCount = 0;
      this.lastRefreshTime = currentTime;
    }
  }

  // Sinclair byte code → Modern Unicode character conversion
  sinclairToUnicode(byte) {
    return this.sinclairByteToUnicode[byte & 0x7f];
  }

  setUseSinclairFont(useSinclairFont) {
    this.useSinclairFont = useSinclairFont;
    localStorage.setItem(LOCALSTORAGE_RETRO_FONTS_KEY, String(useSinclairFont));
    this.invalidateScreenCache();
  }

  // Modern Unicode character → Sinclair byte code conversion (O(1) via reverse lookup map)
  unicodeToSinclair(char) {
    const byte = this.unicodeToSinclairMap.get(char);
    if (byte !== undefined) return byte;

    // Try uppercase version for case-insensitive matching
    const upperByte = this.unicodeToSinclairMap.get(char.toUpperCase());
    if (upperByte !== undefined) return upperByte;

    // Fallback: return space byte directly to avoid injecting NULs (and avoid recursion)
    return 32;
  }

  // Writes only when the text changed: this runs every frame, mostly with identical values
  setText(element, value) {
    const text = String(value);
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  updateHardwareDisplay() {
    const regs = this.cpu.registers;

    this.setText(this.pcDisplay, formatHex4(regs.PC));
    this.setText(this.spDisplay, formatHex4(regs.SP));

    // Display the next 2 words that would be popped from the stack
    const abovebottom = this.cpu.readWordFromMemory(
      this.memory,
      this.cpu.adjustFFFF(regs.SP + 2)
    );
    const bottomword = this.cpu.readWordFromMemory(this.memory, regs.SP);
    this.setText(
      this.stackContentsDisplay,
      "+2:" + formatHex4(abovebottom) + " SP:" + formatHex4(bottomword)
    );

    this.setText(this.regADisplay, formatHex2(regs.A));
    this.setText(this.regBCDisplay, formatHex2(regs.B) + formatHex2(regs.C));
    this.setText(this.regDEDisplay, formatHex2(regs.D) + formatHex2(regs.E));
    this.setText(this.regHLDisplay, formatHex2(regs.H) + formatHex2(regs.L));
    this.setText(this.flagCDisplay, regs.F.C ? "1" : "0");
    this.setText(this.flagZDisplay, regs.F.Z ? "1" : "0");

    // Show 4 bytes at PC as hex
    const bytes = [];
    for (let i = 0; i < 4; i++) {
      bytes.push(formatHex2(this.memory[this.cpu.adjustFFFF(regs.PC + i)]));
    }
    this.setText(this.currentInstructionDisplay, bytes.join(" "));

    // Display ports 0-4 (Frame, Keyboard, BeepHz, EncodedDuration, BeepVolume)
    const portValues = [];
    for (let port = 0; port <= BEEP_VOLUME_PORT; port++) {
      portValues.push(formatHex2(this.ioMap[port]));
    }
    this.setText(this.portsDisplay, portValues.join(" "));

    if (this.keyCodeCurrent === null) {
      this.setText(this.keyCodeCurrentDisplay, "--");
    } else {
      const hex = formatHex2(this.keyCodeCurrent);
      this.setText(
        this.keyCodeCurrentDisplay,
        this.keyCodeCurrentReleased ? `(${hex})` : hex
      );
    }

    if (typeof this.mipsValue === "number") {
      this.setText(
        this.mipsDisplay,
        this.mipsValue < 10
          ? this.mipsValue.toFixed(1)
          : Math.round(this.mipsValue)
      );
    } else {
      this.setText(this.mipsDisplay, this.mipsValue);
    }
    this.setText(this.refreshRateDisplay, Math.round(this.refreshRate));

    if (this.lastPC === null || regs.PC !== this.lastPC) {
      this.lastPC = regs.PC;
      if (this.lastPC !== this.highlightedPC && this.highlightedPC !== null) {
        this.clearHighlight();
      }
      if (this.state === STATE.STEPPING) {
        this.setHighlight();
      }
    }
  }

  setMagazineListing(text, isError) {
    const machineCodeDiv = document.getElementById("machineCode");
    machineCodeDiv.textContent = text;
    machineCodeDiv.classList.toggle("error", isError);
  }

  clearAssembly() {
    this.setAssemblyCode("");
    this.clearAddressAndOpcodesColumns();
    this.setMagazineListing("", false);
    this.instructionDetails = [];
    this.setState(STATE.NOT_READY);
    this.updateURL("");
  }

  updateButtonVisibility() {
    if (!this.isNarrowViewport()) {
      userMessageAboutBug(
        "updateButtonVisibility called in full viewport",
        "This function should not be called in full viewport mode"
      );
      return;
    }

    const isAssemblyAreaClear = this.getAssemblyCode().trim().length === 0;

    // Only update if the empty/not-empty state has changed
    if (this.lastIsAssemblyAreaClear !== isAssemblyAreaClear) {
      // Empty state shows only load buttons; content state shows clear and assemble
      this.assemblySection.classList.toggle("assembly-empty-state", isAssemblyAreaClear);
      this.assemblySection.classList.toggle("assembly-content-state", !isAssemblyAreaClear);

      // Update the tracked state
      this.lastIsAssemblyAreaClear = isAssemblyAreaClear;
    }
  }

  loadAssemblyCode(code) {
    // Remove first line feed if it's followed by non-blank content
    if (code.startsWith("\n") && code.length > 1 && code[1].trim() !== "") {
      code = code.substring(1);
    }

    // Clear everything first, then load new code
    this.clearAssembly();
    this.setAssemblyCode(code);
  }

  loadDefaultAssembly() {
    this.loadAssemblyCode(DEFAULT_ASM);
  }
  loadBasicsAssembly() {
    this.loadAssemblyCode(BASICS_ASM);
  }
  loadSpaceInvaderAssembly() {
    this.loadAssemblyCode(SPACE_INVADER_ASM);
  }
  loadClaudasaurAssembly() {
    this.loadAssemblyCode(CLAUDASAUR_ASM);
  }

  // The narrow-screen program select (simulator.html); option values name the loaders
  loadProgramFromSelect(select) {
    const loaders = {
      default: () => this.loadDefaultAssembly(),
      basics: () => this.loadBasicsAssembly(),
      spaceInvader: () => this.loadSpaceInvaderAssembly(),
      claudasaur: () => this.loadClaudasaurAssembly(),
    };
    const loader = loaders[select.value];
    if (loader === undefined) {
      userMessageAboutBug(
        "Unknown program selected",
        `loadProgramFromSelect() called with value '${select.value}', which has no loader`
      );
      return;
    }
    loader();
    // Back to the placeholder so the same program can be chosen again after Clear
    select.value = "";
  }

  assembleAndRun() {
    const sourceCode = this.getAssemblyCode();
    const assembler = new Z80Assembler();
    const result = assembler.assemble(sourceCode);

    if (!result.success) {
      // Clear instruction details on assembly failure
      this.instructionDetails = [];

      // Show all errors in machine code window
      let errorText = "Assembly Errors:\n\n";
      const lines = sourceCode.split("\n");
      result.errors.forEach((error) => {
        const line = lines[error.line - 1] || "";
        const addressText =
          error.address !== null && error.address !== undefined
            ? `@ address 0x${error.address.toString(16).toUpperCase()}`
            : "@ unknown address";
        errorText += `Line ${
          error.line
        }, ${addressText}: "${line.trim()}" - ${error.message}\n`;
      });
      this.setMagazineListing(errorText, true);
      this.setState(STATE.NOT_READY);
      return;
    }

    this.loadAddress = result.loadAddress;
    this.resetBeepPorts();
    // Initialize audio context for beep functionality
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
      } catch (e) {
        userMessage(
          "Audio context initialization failed - beep functionality disabled"
        );
      }
    }

    // Store instruction details for opcode display and line mapping
    this.instructionDetails = result.instructionDetails;
    this.renderAssemblyLines();

    // Load machine code into memory using shared memory loading function
    Z80Assembler.loadOpcodesIntoMemory(this.memory, this.instructionDetails);

    // Clear the screen when assembling and running
    this.clearScreen();

    if (this.state === STATE.FREE_RUNNING) {
      // Hot-reload case: preserve CPU state, just inform user
      userMessage("Code hot-reloaded - may need Reset to run properly");
      this.cpu.set(this.loadAddress);
    } else {
      this.cpu.set(this.loadAddress, 0xffff);
      this.setState(STATE.FREE_RUNNING);
    }
    this.lastPC = null;

    this.setMagazineListing(
      assembler.generateMachineCodeListing(
        result.instructionDetails,
        result.loadAddress
      ),
      false
    );

    // Update all editor columns with new instruction details
    this.updateAddressAndOpcodesColumns();

    // Show address and opcodes columns on successful assembly
    this.showAddressOpcodesColumns();

    // Update URL with encoded program
    this.updateURL(sourceCode);

    // Focus execution area to enable keyboard capture UX
    const executionSection = document.querySelector(".execution-section");
    executionSection.focus();
    executionSection.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  updateURL(sourceCode) {
    if (this.isUrlUpdateDisabled()) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const currentEncoded = urlParams.get("asm");
    const desiredEncoded = !sourceCode ? null : btoa(encodeURIComponent(sourceCode));

    // If no change would occur, do nothing silently
    if (currentEncoded === desiredEncoded) {
      return;
    }

    // file:// protocol doesn't support history updates.
    if (window.location.protocol === "file:") {
      userMessage(
        "Saving program to query params not implemented for file://."
      );
      return;
    }

    const newUrl = new URL(window.location);

    if (desiredEncoded === null) {
      // Remove asm parameter when clearing
      newUrl.searchParams.delete("asm");
    } else {
      // Set asm parameter when there's code
      const baseUrl =
        window.location.origin + window.location.pathname + "?asm=";
      const totalLength = baseUrl.length + desiredEncoded.length;

      if (totalLength > MAX_URL_LENGTH) {
        const overage = totalLength - MAX_URL_LENGTH;
        userMessage(
          `Source code was not encoded on URL because it's too large (${totalLength} bytes, ${overage} over ${MAX_URL_LENGTH} limit). See Docs.`
        );
        return;
      }

      newUrl.searchParams.set("asm", desiredEncoded);
    }

    // History update (supported on non-file protocols)
    try {
      window.history.replaceState(null, "", newUrl);
    } catch (historyError) {
      userMessageAboutBug(
        "Failed to update URL history",
        historyError.message
      );
    }
  }

  loadFromURL() {
    try {
      if (this.isUrlUpdateDisabled()) {
        return false;
      }

      // Can read URL parameters even from file system, just can't modify them
      const urlParams = new URLSearchParams(window.location.search);
      const encoded = urlParams.get("asm");

      if (encoded) {
        let sourceCode = decodeURIComponent(atob(encoded));
        this.loadAssemblyCode(sourceCode);
        return true;
      }
    } catch (e) {
      userMessageAboutBug(
        "Failed to load assembly program from custom URL",
        e.message
      );
    }
    return false;
  }

  isUrlUpdateDisabled() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("asm") === "dont";
  }

  // Stop continuous execution
  stopContinuousExecution() {
    if (this.runLoopInterval) {
      this.clearTimer(this.runLoopInterval);
      this.runLoopInterval = null;
    }
  }

  // Set state and update UI accordingly
  setState(newState) {
    this.state = newState;
    this.renderButtons();

    // Update body class for styling
    document.body.classList.toggle("stepping", newState === STATE.STEPPING);

    switch (newState) {
      case STATE.NOT_READY:
        this.stopContinuousExecution();
        break;

      case STATE.FREE_RUNNING:
        this.startContinuousExecution();
        break;

      case STATE.STEPPING:
        this.stopContinuousExecution();
        // Auto-collapse sections on narrow viewports to save screen space
        if (this.isNarrowViewport()) {
          [this.listingSection, this.consoleSection].forEach((section) => {
            if (section) section.classList.add("collapsed");
          });
        }
        break;
    }
  }

  // Dynamic button rendering based on current state
  renderButtons() {
    const container = document.getElementById("executionControls");
    const executionControls = document.querySelector(".execution-controls"); // Get the actual execution-controls container

    // Clear both containers of any existing not-ready-message
    container.innerHTML = "";
    const existingMessage =
      executionControls.querySelector(".not-ready-message");
    if (existingMessage) {
      existingMessage.remove();
    }

    switch (this.state) {
      case STATE.NOT_READY:
        // Add not-ready-message as direct child of execution-controls
        const notReadyDiv = document.createElement("div");
        notReadyDiv.className = "not-ready-message";
        notReadyDiv.textContent =
          'On the top panel, enter assembly code and click "Assemble and Run"';
        notReadyDiv.addEventListener("pointerdown", () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        // Insert before the keyboard-status (which should be last)
        const keyboardStatus =
          executionControls.querySelector(".keyboard-status");
        if (keyboardStatus) {
          executionControls.insertBefore(notReadyDiv, keyboardStatus);
        } else {
          executionControls.appendChild(notReadyDiv);
        }
        break;

      case STATE.FREE_RUNNING:
        container.innerHTML = `
                    <button onclick="sinclaude.breakRequest()" title="${this.getBreakButtonTitle()}">Break</button>
                    <button onclick="sinclaude.resetRequest()" title="${this.getResetButtonTitle()}">Reset</button>
                    <button id="speedToggle" onclick="sinclaude.toggleSpeed()" title="${this.getSpeedToggleTitle()}">${
                      this.getSpeedToggleLabel()
                    }</button>
                `;
        break;

      case STATE.STEPPING:
        container.innerHTML = `
                    <button onclick="sinclaude.stepRequest()" title="${this.getStepButtonTitle()}">Step</button>
                    <button onclick="sinclaude.resetRequest()" title="${this.getResetButtonTitle()}">Reset</button>
                    <button onclick="sinclaude.runRequest()" title="${this.getRunButtonTitle()}">Run</button>
                `;
        break;
    }
  }

  // Handle Reset button click
  resetRequest() {
    this.resetBeepPorts();
    this.cpu.reset();
    // Set PC to the program's load address (ORG)
    if (this.loadAddress !== undefined) {
      this.cpu.set(this.loadAddress);
    }
    // Restart the instruction counters together so the MIPS delta never goes negative
    this.instructionCount = 0;
    this.mipsInstructionCount = 0;
    this.updateHardwareDisplay();
    // Clear any animation timers during reset
    this.clearNonEssentialTimers();
  }

  // Clear animation timers but keep essential display/run timers
  clearNonEssentialTimers() {
    // Keep display interval, run loop and the version check (whose id the
    // version checker owns), clear animation timers
    const essentialTimers = new Set([
      this.displayUpdateInterval,
      this.runLoopInterval,
      window.versionChecker ? window.versionChecker.versionCheckInterval : null,
    ]);
    this.activeTimers.forEach((timerId) => {
      if (!essentialTimers.has(timerId)) {
        this.clearTimer(timerId);
      }
    });
  }

  setupCleanupHandlers() {
    // Ensure all timers are cleared when page unloads
    window.addEventListener("beforeunload", () => {
      this.clearAllTimers();
      this.cleanupAudio();
      this.cleanupObservers();
    });

    // Also clear on visibility change (tab switching)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clearNonEssentialTimers();
        this.cleanupAudio();
      }
    });
  }

  cleanupObservers() {
    // Disconnect MutationObserver
    if (this.assemblyObserver) {
      this.assemblyObserver.disconnect();
      this.assemblyObserver = null;
    }
  }

  cleanupAudio() {
    // Close audio context (individual oscillators will clean themselves up)
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch (e) {
        // Context might already be closed
      }
    }
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
    if (this.runLoopInterval !== null) {
      userMessageAboutBug(
        "Already running - ignoring request",
        "startContinuousExecution called while runLoopId !== null"
      );
      return;
    }

    // Check if assembly is loaded
    if (this.state === STATE.NOT_READY) {
      userMessage("Please assemble code first before starting execution.");
      return;
    }

    this.mipsLastUpdate = performance.now();
    this.mipsInstructionCount = this.instructionCount;
    this.runLoop();
  }

  runLoop() {
    if (this.state !== STATE.FREE_RUNNING) return;

    const endTime = performance.now() + 1000 / FPS / 2;
    while (performance.now() < endTime) {
      const result = this.cpu.executeSteps(
        this.memory,
        this.ioMap,
        RUN_BATCH_INSTRUCTIONS
      );
      this.instructionCount += result.instructionsExecuted;

      // Check for beep port changes after Z80 execution
      this.handleBeepPortChange();

      if (result.error) {
        userMessageAboutBug("CPU error during run", `${result.error}`);
        return;
      }

      if (result.halted) {
        userMessage("CPU halted - switched to stepping mode");
        this.setState(STATE.STEPPING);
        return;
      }
    }
    // Schedule next execution cycle
    this.runLoopInterval = this.createTimer(
      () => this.runLoop(),
      RUN_LOOP_INTERVAL_MS,
      false
    );
  }

  updateMIPS() {
    if (this.state !== STATE.FREE_RUNNING) {
      this.mipsValue = "-";
      return;
    }

    const currentTime = performance.now();
    const timeElapsed = (currentTime - this.mipsLastUpdate) / 1000;
    const instructionsExecuted =
      this.instructionCount - this.mipsInstructionCount;

    const instantMips = instructionsExecuted / timeElapsed / one_million;

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
      userMessage(
        "Please assemble code first before stepping through execution."
      );
      return;
    }

    if (this.state === STATE.FREE_RUNNING) {
      userMessageAboutBug(
        "Use Break button to switch to stepping mode",
        "stepRequest() called while state === STATE.FREE_RUNNING"
      );
      return;
    }

    // Execute one instruction in stepping mode
    this.executeOneInstruction();
  }

  executeOneInstruction() {
    const result = this.cpu.executeSteps(this.memory, this.ioMap, 1);
    this.instructionCount += result.instructionsExecuted;

    // Check for beep port changes after Z80 execution
    this.handleBeepPortChange();

    this.updateHardwareDisplay();

    if (result.error) {
      userMessageAboutBug("CPU error during step", `${result.error}`);
    }
  }

  setHighlight() {
    if (!this.instructionDetails || this.instructionDetails.length === 0) {
      userMessageAboutBug(
        "Line highlighting failed - no instruction details mapping",
        "setHighlight() called but instructionDetails array is empty - assembly should have provided instruction mapping"
      );
      return;
    }

    // Only act if PC has changed from what's currently highlighted
    const pc = this.cpu.PC;
    if (this.highlightedPC === pc) {
      return;
    }

    // Find the last source line that corresponds to the current PC (to skip labels)
    let targetLine = null;
    for (let i = 0; i < this.instructionDetails.length; i++) {
      const detail = this.instructionDetails[i];
      if (detail && detail.startAddress === pc) {
        targetLine = i;
      } else if (
        detail &&
        detail.startAddress !== null &&
        detail.startAddress > pc
      ) {
        break;
      }
    }

    this.clearHighlight();

    // Only highlight if we found a matching line
    if (targetLine === null) {
      return;
    }

    // Lines were wrapped in spans at assemble time (renderAssemblyLines). Edits since
    // then can change that structure; the line mapping is stale then and nothing is
    // highlighted until the next assembly.
    const lineSpan = this.assemblyColumn.querySelectorAll(".source-line")[targetLine];
    if (lineSpan === undefined) {
      return;
    }
    lineSpan.classList.add("highlighted-line");
    this.highlightedPC = pc;

    // Scroll the highlighted line into view if not currently editing
    // Only scroll if it won't move the step button out of view
    const selection = window.getSelection();
    const isEditing =
      selection.rangeCount > 0 &&
      this.assemblyColumn.contains(selection.anchorNode);
    if (!isEditing) {
      scrollNearestKeepAnchorVisible(
        ".highlighted-line",
        "#executionControls button"
      );
    }
  }

  clearHighlight() {
    const highlighted = this.assemblyColumn.querySelector(".highlighted-line");
    if (highlighted) {
      highlighted.classList.remove("highlighted-line");
    }
    this.highlightedPC = null;
  }

  // Wraps each source line in a span so stepping can highlight a line by toggling a
  // class instead of rewriting the editor content (which also disturbed the cursor)
  renderAssemblyLines() {
    const lines = this.getAssemblyCode().split("\n");
    this.assemblyColumn.replaceChildren();
    lines.forEach((line, index) => {
      if (index > 0) {
        this.assemblyColumn.append("\n");
      }
      const lineSpan = document.createElement("span");
      lineSpan.className = "source-line";
      lineSpan.textContent = line;
      this.assemblyColumn.append(lineSpan);
    });
  }

  expandElement(elementId) {
    const targetElement = document.getElementById(elementId);

    if (!targetElement) {
      userMessageAboutBug(
        "Element expansion failed - element not found",
        `expandElement('${elementId}') called but target element not found in DOM`
      );
      return;
    }

    if (targetElement.classList.contains("expanded-element")) {
      this.restoreElement(targetElement);
    } else {
      this.performExpansion(targetElement);
    }
  }

  performExpansion(element) {
    // Store original styles
    const originalStyles = {
      position: element.style.position,
      top: element.style.top,
      left: element.style.left,
      width: element.style.width,
      height: element.style.height,
    };
    element.dataset.originalStyles = JSON.stringify(originalStyles);

    // Hide columns when maximizing the editing area
    this.hideAddressOpcodesColumns();

    // Create and show restore note (its z-index comes from the stylesheet)
    const noteHowToRestoreSize = document.createElement("div");
    noteHowToRestoreSize.id = "expandnoteHowToRestoreSize";
    noteHowToRestoreSize.className = "restore-size-note";
    noteHowToRestoreSize.textContent = "Touch to restore size";
    noteHowToRestoreSize.addEventListener("pointerdown", () =>
      this.restoreElement(element)
    );
    document.body.appendChild(noteHowToRestoreSize);

    element.style.position = "fixed";
    element.style.top = "4vh";
    element.style.left = "0";
    element.style.width = "100vw";
    element.style.height = "96vh";
    element.classList.add("expanded-element");
  }

  restoreElement(element) {
    // Restore original styles
    const originalStyles = JSON.parse(element.dataset.originalStyles);
    Object.keys(originalStyles).forEach((key) => {
      element.style[key] = originalStyles[key];
    });

    // Remove restore note
    document.getElementById("expandnoteHowToRestoreSize").remove();

    element.classList.remove("expanded-element");
    delete element.dataset.originalStyles;
  }

  applyButtonEditMode(enabled) {
    this.buttonEditMode = enabled;
    const toggle = document.querySelector(".button-caption-edit-toggle");
    toggle.textContent = enabled
      ? "Click here to end button customization"
      : "Customize button-to-key mapping";
    toggle.classList.toggle("active", enabled);
    document
      .querySelectorAll(".game-buttons button")
      .forEach((button) => button.classList.toggle("edit-mode", enabled));
  }

  toggleButtonCaptionEdit() {
    this.applyButtonEditMode(!this.buttonEditMode);
  }
}
