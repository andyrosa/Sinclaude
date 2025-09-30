const SCREEN_START = 60000;
const SCREEN_WIDTH = 32;
const SCREEN_HEIGHT = 24;
const MEMORY_SIZE = 65536;
const FRAME_COUNT_PORT = 0;
const KEYBOARD_PORT = 1;
const KBD_NO_KEY_PRESSED = -1;
const BEEP_10HZ_PORT = 2;
const BEEP_MS_PORT = 3;

// Sinclair block characters that should not use retro font
const sinclairBlockChars = [6, 8, 9, 13, 14, 16, 17, 18, 19, 20, 21, 22];

class Simulator {
  constructor() {
    this.cpu = new Z80CPU();
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.ioMap = new Uint8Array(256);
    this.setState(STATE.NOT_READY);
    this.instructionCount = 0;
    this.mipsValue = 0.0;
    this.refreshRate = 0.0;
    this.lastRefreshTime = performance.now();
    this.refreshCount = 0;
    this.mipsLastUpdate = performance.now();
    this.mipsInstructionCount = 0;
    this.keyCodeCurrent = 0;
    this.keyCodeCurrentReleased = true;
    this.runLoopInterval = null;
    this.fastMode = false;
    this.easterEggEnabled = false;
    this.isBootSequenceRunning = false;

    // Line highlighting for stepping
    this.instructionDetails = [];
    this.highlightedPC = null;
    this.lastPC = null;

    // Screen optimization tracking
    this.lastScreenState = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.screenElements = [];
    this.lastScreenStateIsValid = false;

    // Timer management
    this.activeTimers = new Set();
    this.displayUpdateInterval = null;

    // Beep functionality
    this.audioContext = null;
    this.currentOscillator = null;
    this.lastBeepHz = 0;
    this.lastBeepMs = 0;

    // Sinclair byte <-> Unicode char
    this.sinclairByteToUnicodeNeverInverts = {};
    this.initializeCharacterMappings();
    this.initializeKeyMappings();

    // Button lifecycle state tracking
    this.lastIsAssemblyAreaClear = null;

    this.useSinclairFont = true;

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

    // Build Sinclair byte -> Unicode char
    for (let i = 0; i < 128; i++) {
      this.sinclairByteToUnicodeNeverInverts[i] =
        sinclairByteToUnicode[i] || "¿";
    }

    // Extended range 128-255: Inverted/flashing characters
    // In ZX Spectrum, 128+ were inverted versions of 0-127
    for (let i = 128; i < 256; i++) {
      const baseChar = sinclairByteToUnicode[i - 128];
      this.sinclairByteToUnicodeNeverInverts[i] = baseChar || "?";
    }
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
    this.RAMatPCDisplay = document.getElementById("RAMatPC");
    this.portsDisplay = document.getElementById("ports");

    // Assembly editor elements
    this.assemblyEditor = document.getElementById("assemblyEditor");
    this.addressColumn = document.getElementById("addressColumn");
    this.opcodesColumn = document.getElementById("opcodesColumn");
    this.assemblyColumn = document.getElementById("assemblyColumn");

    // Listing section elements
    this.listingSection = document.querySelector(".listing-section");

    // Generate program buttons and key inputs
    this.createGameButtons();

    // Setup assembly editor
    this.setupAssemblyEditor();

    // Setup listing section toggle
    this.setupListingToggle();

    // Setup console section toggle
    this.setupConsoleToggle();

    // Initialize edit toggle text by triggering the two-state function
    toggleButtonCaptionEdit();
    toggleButtonCaptionEdit();

    // Setup touch hints for touch-enabled devices
    this.setupTouchHints();
  }

  setupAssemblyEditor() {
    if (!this.assemblyColumn) {
      userMessageAboutBug(
        "Assembly editor setup failed",
        "assemblyColumn element not found in DOM"
      );
      return;
    }

    // Synchronize scrolling between columns
    const syncScroll = (source, targets) => {
      targets.forEach((target) => {
        if (target && target !== source) {
          target.scrollTop = source.scrollTop;
        }
      });
    };

    // Add scroll event listeners to keep columns in sync
    const columns = [
      this.addressColumn,
      this.opcodesColumn,
      this.assemblyColumn,
    ];
    columns.forEach((column) => {
      if (column) {
        column.addEventListener("scroll", () => {
          syncScroll(
            column,
            columns.filter((c) => c !== column)
          );
        });
      }
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

    // Handle keyboard shortcuts
    this.assemblyColumn.addEventListener("keydown", (e) => {
      // Handle Tab key to maintain indentation
      if (e.key === "Tab") {
        e.preventDefault();
        this.insertTextAtCursor("  "); // 2 spaces for tab; let's skimp; we got 32 total
        this.hideAddressOpcodesColumns();
      }

      // Handle Enter key to maintain proper line breaks
      if (e.key === "Enter") {
        e.preventDefault();
        this.insertTextAtCursor("\n");
        this.hideAddressOpcodesColumns();
      }

      // Hide columns on any other typing
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        this.hideAddressOpcodesColumns();
      }
    });
  }

  setupAssemblyContentObserver() {
    if (!this.isNarrowViewport()) {
      return; // Skip observer setup on full viewports - buttons stay visible
    }

    // Create a MutationObserver to watch for content changes in the assembly area
    this.assemblyObserver = new MutationObserver((mutations) => {
      // Check if any mutation actually changed the text content
      const hasContentChange = mutations.some(
        (mutation) =>
          mutation.type === "childList" || mutation.type === "characterData"
      );

      if (hasContentChange) {
        // Content changed - update button visibility
        this.updateButtonVisibility();
      }
    });

    // Start observing the assembly column for changes
    if (this.assemblyColumn) {
      this.assemblyObserver.observe(this.assemblyColumn, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  // Helper method to check if we're on a narrow viewport that needs dynamic buttons
  isNarrowViewport() {
    return window.innerWidth <= BREAKPOINTS.MOBILE_MAX;
  }

  // Helper method to check if device has touch capability
  isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  setupListingToggle() {
    if (this.listingSection) {
      const header = this.listingSection.querySelector("h3");
      if (header) {
        header.addEventListener("click", () => {
          this.toggleListingSection();
        });
      }
    }
  }

  setupConsoleToggle() {
    this.consoleSection = document.querySelector(".console-section");
    if (this.consoleSection) {
      const header = this.consoleSection.querySelector("h3");
      if (header) {
        header.addEventListener("click", () => {
          this.toggleConsoleSection();
        });
      }
    }
  }

  toggleListingSection() {
    if (this.listingSection) {
      this.listingSection.classList.toggle("collapsed");
    }
  }

  toggleConsoleSection() {
    if (this.consoleSection) {
      this.consoleSection.classList.toggle("collapsed");
    }
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
    if (this.assemblyColumn) {
      // If the column contains HTML (from highlighting), extract just the text
      return this.assemblyColumn.textContent || "";
    }
    return "";
  }

  setAssemblyCode(code) {
    if (this.assemblyColumn) {
      // Always set as plain text to avoid HTML issues
      this.assemblyColumn.textContent = code;
    }
    this.updateAddressAndOpcodesColumns();
  }

  updateAddressAndOpcodesColumns() {
    if (!this.addressColumn || !this.opcodesColumn || !this.assemblyColumn) {
      return;
    }

    const lines = this.getAssemblyCode().split("\n");
    const addressLines = [];
    const opcodeLines = [];

    lines.forEach((line, index) => {
      const details = this.instructionDetails[index];
      if (details) {
        const hexAddr =
          details.startAddress !== null
            ? details.startAddress.toString(16).toUpperCase().padStart(4, "0")
            : "----";
        const opcodeString = details.opcodes
          .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
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
    if (this.addressColumn) {
      this.addressColumn.textContent = "";
    }
    if (this.opcodesColumn) {
      this.opcodesColumn.textContent = "";
    }
  }

  showAddressOpcodesColumns() {
    if (this.assemblyEditor) {
      this.assemblyEditor.classList.add("show-address-opcodes");
    }
  }

  hideAddressOpcodesColumns() {
    if (this.assemblyEditor) {
      this.assemblyEditor.classList.remove("show-address-opcodes");
    }
  }

  createGameButtons() {
    const gameButtonsDiv = document.getElementById("gameButtons");
    const defaultKeys = ["W", "S", "Space", "A", "D"];

    // Clear existing content
    gameButtonsDiv.innerHTML = "";

    // Create 5 program buttons with key names as text
    for (let i = 1; i <= 5; i++) {
      // Create button
      const button = document.createElement("button");
      button.textContent = defaultKeys[i - 1];
      button.tabIndex = 0; // Make button focusable when clicked
      button.dataset.buttonNumber = i; // Store button number for reference

      // Add event listeners for both game functionality and edit mode
      button.addEventListener("pointerdown", (e) => {
        this.handleButtonClick(button, i, e);
        e.preventDefault();
      });
      button.addEventListener("pointerup", (e) => {
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
    }, 10);

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

    // Helper function to update keyboardStatus
    const updateKeyboardStatus = (isCaptured) => {
      if (keyboardStatus) {
        keyboardStatus.textContent = isCaptured
          ? KBD_CAPTURED_MSG
          : KBD_NOT_CAPTURED_MSG;
        if (isCaptured) {
          keyboardStatus.classList.remove("get-attention");
        } else {
          keyboardStatus.classList.add("get-attention");
        }
      }
    };

    // Set initial state
    updateKeyboardStatus(false);

    // Desktop: Hover-based keyboard capture
    executionSection.addEventListener("mouseenter", () => {
      this.keyboardCaptureActive = true;
      updateKeyboardStatus(true);
    });

    executionSection.addEventListener("mouseleave", () => {
      this.keyboardCaptureActive = false;
      updateKeyboardStatus(false);
      this.setKey(KBD_NO_KEY_PRESSED);
    });

    executionSection.addEventListener("focus", () => {
      this.keyboardCaptureActive = true;
      updateKeyboardStatus(true);
    });

    executionSection.addEventListener("blur", () => {
      this.keyboardCaptureActive = false;
      updateKeyboardStatus(false);
      this.setKey(KBD_NO_KEY_PRESSED);
    });

    // Mobile: Touch-based keyboard capture
    executionSection.addEventListener("pointerdown", (e) => {
      this.keyboardCaptureActive = true;
      updateKeyboardStatus(true);
    });

    // Document-level touch to detect touches outside execution section
    document.addEventListener("pointerdown", (e) => {
      if (!executionSection.contains(e.target)) {
        this.keyboardCaptureActive = false;
        updateKeyboardStatus(false);
        this.setKey(KBD_NO_KEY_PRESSED);
      }
    });

    // Document-level keyboard capture - only process when capture is active
    document.addEventListener("keydown", (e) => {
      if (this.keyboardCaptureActive) {
        // Don't capture keyboard input when user is typing in input boxes or textareas
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          return; // Allow normal browser behavior for form inputs
        }
        this.setKey(e.keyCode || e.which);
        e.preventDefault(); // Prevent default browser behavior
      }
    });

    document.addEventListener("keyup", (e) => {
      if (this.keyboardCaptureActive) {
        // Don't capture keyboard input when user is typing in input boxes or textareas
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
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
      [32, "Space"],
      [27, "Escape"],
      [38, "ArrowUp"],
      [40, "ArrowDown"],
      [37, "ArrowLeft"],
      [39, "ArrowRight"],
      [13, "Enter"],
      [9, "Tab"],
    ];

    this.keyCodeToKeyName = new Map(specialKeys);
    // lowercase for easier find
    this.lcKeyNameToKeyCode = new Map(
      specialKeys.map(([code, name]) => [name.toLowerCase(), code])
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

  setupTouchHints() {
    // Show touch hints only on touch-enabled devices
    if (this.isTouchDevice()) {
      const touchHints = document.querySelectorAll(".touch-hint");
      touchHints.forEach((hint) => {
        hint.style.display = "block";
      });
    }
  }

  buttonClick(buttonNumber) {
    // Get the button text instead of text box value
    const gameButtonsDiv = document.getElementById("gameButtons");
    const buttons = gameButtonsDiv.querySelectorAll("button");
    // Convert to 0-based index
    const button = buttons[buttonNumber - 1];

    if (!button) {
      userMessageAboutBug(
        "Game button not found",
        `buttonClick(${buttonNumber}) called but button ${buttonNumber} not found in DOM`
      );
      return;
    }

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

  pokeMemory(address, value, description) {
    this.memory[address] = value;
  }

  OutPort(port, value) {
    this.ioMap[port] = value;
  }

  handleBeepPortChange() {
    const beepHz = this.ioMap[BEEP_10HZ_PORT] * 10;
    const beepMs = this.ioMap[BEEP_MS_PORT];

    // If both values are non-zero, start sound and reset to zero
    if (beepHz > 0 && beepMs > 0) {
      this.playBeep(beepHz, beepMs);
      this.OutPort(BEEP_10HZ_PORT, 0);
      this.OutPort(BEEP_MS_PORT, 0);
    }
  }

  playBeep(frequency, duration) {
    // Don't play if duration is zero or no audio context
    if (duration === 0 || !this.audioContext) {
      return;
    }

    let oscillator = this.audioContext?.createOscillator();
    if (!oscillator) return;

    let gain = this.audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    gain.gain.value = 0.1;
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
      this.OutPort(KEYBOARD_PORT, KBD_NO_KEY_PRESSED & 0xff, "no-key");
    } else if (keyCode === 27) {
      this.OutPort(KEYBOARD_PORT, 12, "ESC key");
    } else if (keyCode === 13) {
      this.OutPort(KEYBOARD_PORT, 13, "ENTER key");
    } else if (keyCode === 37) {
      this.OutPort(KEYBOARD_PORT, 144, "LEFT arrow");
    } else if (keyCode === 38) {
      this.OutPort(KEYBOARD_PORT, 145, "UP arrow");
    } else if (keyCode === 39) {
      this.OutPort(KEYBOARD_PORT, 146, "RIGHT arrow");
    } else if (keyCode === 40) {
      this.OutPort(KEYBOARD_PORT, 147, "DOWN arrow");
    } else {
      const sinclairCode = this.unicodeToSinclair(String.fromCharCode(keyCode));
      this.OutPort(
        KEYBOARD_PORT,
        sinclairCode,
        `key ${keyCode} -> "${String.fromCharCode(keyCode)}"`
      );
    }
  }

  bootShow() {
    // Define stage configuration (handler function, duration in ms before start the next one)
    // duration -1 means last one
    this.stageConfig = [
      { handler: "displayCharacterGrid", duration: 1000 },
      { handler: "benchmarkCPU", duration: 1000 },
      { handler: "showSinclairCopyright", duration: 1 },
      { handler: "reportInstructionSetAnalysisFixThis", duration: 1 },
      { handler: "runAssemblerTests", duration: 1 },
      { handler: "runZ80CPUTests", duration: -1 },
    ];

    // Mark boot sequence as running
    this.isBootSequenceRunning = true;

    // Set up click listener for boot sequence cancellation
    this.setupBootSequenceClickHandler();

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

    // stage handler
    const handlerFunction = this[stage.handler];
    if (typeof handlerFunction === "function") {
      const result = handlerFunction.call(this);
      // Store timer ID if handler returns one
      if (result) {
        this.currentStageTimer = result;
      }
    } else {
      userMessageAboutBug(
        "Stage handler not found",
        `Handler function '${stage.handler}' not found`
      );
      return;
    }

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
      // Last stage - mark boot sequence as complete
      this.isBootSequenceRunning = false;
    }
  }

  cancelBootSequence() {
    // Mark boot sequence as no longer running - this will prevent startStage from continuing
    this.isBootSequenceRunning = false;

    // Remove boot sequence click handler
    if (this.bootSequenceClickHandler) {
      this.screen.removeEventListener(
        "pointerdown",
        this.bootSequenceClickHandler
      );
      this.bootSequenceClickHandler = null;
    }

    // Enable easter egg immediately when cancelled
    this.easterEggEnabled = true;
    this.setupAnimationEasterEgg();

    userMessage("Boot sequence cancelled");
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
        return { benchResult, elapsedSeconds: elapsedSeconds };
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

  displayTextAtPosition(text, row, col) {
    const addr = SCREEN_START + row * SCREEN_WIDTH + col;
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
    for (let line = 0; line < SCREEN_HEIGHT; line++) {
      for (let col = 0; col < SCREEN_WIDTH; col++) {
        const addr = SCREEN_START + line * SCREEN_WIDTH + col;
        this.memory[addr] = this.unicodeToSinclair(" ");
      }
    }
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

        const screenAddr =
          SCREEN_START + currentLine * SCREEN_WIDTH + screenCol;

        // Write starting hex code (2 chars)
        const startCodeStr = groupStartCode
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
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
        this.memory[SCREEN_START + currentLine * SCREEN_WIDTH + screenCol] =
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

  playArtisticAnimation() {
    // Set up animation interval and return the timer ID
    const animationTimer = this.createTimer(
      () => {
        this.renderArtisticPattern();
      },
      20,
      true
    );

    // Call the animation function immediately for the first frame
    this.renderArtisticPattern();

    // Return timer ID so caller can clean it up
    return animationTimer;
  }

  renderArtisticPattern() {
    for (let line = 0; line < SCREEN_HEIGHT; line++) {
      for (let col = 0; col < SCREEN_WIDTH; col++) {
        const addr = SCREEN_START + line * SCREEN_WIDTH + col;

        // Create concentric diamond/wave pattern
        const centerX = 16;
        const centerY = 12;
        const distanceFromCenter =
          Math.abs(col - centerX) + Math.abs(line - centerY);

        // Create ripple effect with time-based animation
        const time = Date.now() * 0.001; // Convert to seconds
        const wave = Math.sin(distanceFromCenter * 0.5 + time * 2);
        const pattern =
          Math.sin(line * 0.3 + col * 0.2 + time) *
          Math.cos(distanceFromCenter * 0.4 + time * 1.5);

        const combinedPattern =
          (wave + pattern + Math.sin(time + line * col * 0.01)) / 3;
        const charIndex = Math.floor(
          (combinedPattern + 1) * 0.5 * sinclairBlockChars.length
        );

        this.memory[addr] =
          sinclairBlockChars[
            Math.max(0, Math.min(sinclairBlockChars.length - 1, charIndex))
          ];
      }
    }
  }

  showSinclairCopyright() {
    this.clearScreen();

    // a-historic
    const copyrightText = "(C) 1981 SINCLAIR RESEARCH";
    const line = SCREEN_HEIGHT - 1;
    const padding = Math.floor((SCREEN_WIDTH - copyrightText.length) / 2);
    const copyrightStart = SCREEN_START + line * SCREEN_WIDTH;

    for (let i = 0; i < copyrightText.length; i++) {
      this.memory[copyrightStart + padding + i] = this.unicodeToSinclair(
        copyrightText[i]
      );
    }
  }

  setupBootSequenceClickHandler() {
    if (!this.screen) return;

    const handleBootClick = () => {
      if (this.isBootSequenceRunning) {
        this.cancelBootSequence();
      }
    };

    // Remove any existing boot sequence handler
    if (this.bootSequenceClickHandler) {
      this.screen.removeEventListener(
        "pointerdown",
        this.bootSequenceClickHandler
      );
    }

    // Store handler reference for cleanup
    this.bootSequenceClickHandler = handleBootClick;

    // Add pointer listener
    this.screen.addEventListener("pointerdown", handleBootClick);
  }

  setupAnimationEasterEgg() {
    if (!this.screen) return;

    const handleClick = () => {
      if (this.easterEggEnabled) {
        this.triggerAnimationEasterEgg();
      }
    };

    // Remove existing listener to avoid duplicates
    if (this.animationEasterEggHandler) {
      this.screen.removeEventListener(
        "pointerdown",
        this.animationEasterEggHandler
      );
    }

    // Store handler reference for cleanup
    this.animationEasterEggHandler = handleClick;

    // Add pointer listener
    this.screen.addEventListener("pointerdown", handleClick);
  }

  triggerAnimationEasterEgg() {
    // One-shot: disable further triggers immediately and remove handler
    this.easterEggEnabled = false;
    if (this.animationEasterEggHandler && this.screen) {
      this.screen.removeEventListener(
        "pointerdown",
        this.animationEasterEggHandler
      );
    }

    // Show animation then return to SINCLAIR screen
    const animationTimer = this.playArtisticAnimation();

    this.createTimer(
      () => {
        this.clearTimer(animationTimer);
        this.showSinclairCopyright();
      },
      4000,
      false
    );
  }

  reportInstructionSetAnalysisFixThis() {
    // Create an instance of the test class and call its method
    if (typeof Z80AssemblerTestClass !== "undefined") {
      const testInstance = new Z80AssemblerTestClass();
      return testInstance.reportInstructionSetAnalysis();
    } else {
      userMessageAboutBug(
        "Z80AssemblerTestClass not available",
        "Cannot perform instruction set analysis - test class not found"
      );
    }
  }

  runAssemblerTests() {
    try {
      // Check if assembler_test.js Z80AssemblerTestClass is available
      if (typeof Z80AssemblerTestClass !== "undefined") {
        // Capture console.error and redirect to userMessage
        const originalError = console.error;
        console.error = (message) =>
          userMessageAboutBug(`Assembler Test Error: ${message}`);

        try {
          const z80AssemblerTestClass = new Z80AssemblerTestClass();
          z80AssemblerTestClass.runAllTests();

          // Report summary to user console
          userMessage(
            `Assembler Tests: ${z80AssemblerTestClass.passedCount} passed, ${z80AssemblerTestClass.failedTests.length} failed`
          );
        } finally {
          console.error = originalError;
        }
      } else {
        userMessageAboutBug(
          "Assembler tests cannot run - z80_assembler_test.js not loaded"
        );
      }
    } catch (error) {
      userMessageAboutBug("Assembler test error", error.message);
    }
  }

  runZ80CPUTests() {
    try {
      // Check if Z80CPUEmulatorTestClass class is available from z80_cpu_emulator_test.js
      if (typeof Z80CPUEmulatorTestClass !== "undefined") {
        // Also check if runZ80CPUEmulatorTestClass is available since it's required
        if (typeof runZ80CPUEmulatorTestClass === "undefined") {
          userMessage(
            "Z80 CPU tests cannot run - z80_cpu_emulator_tests.js not loaded (runZ80CPUEmulatorTestClass function missing)"
          );
          return;
        }

        // Capture console.error and preserve detailed error messages
        const originalError = console.error;
        console.error = (message) => {
          userMessage(message);
        };

        try {
          const z80CPUTestClass = new Z80CPUEmulatorTestClass();
          const success = z80CPUTestClass.runAllTests();

          // Report summary to user console
          userMessage(
            `Z80 CPU Tests: ${z80CPUTestClass.passedCount} passed, ${z80CPUTestClass.failedTests.length} failed`
          );
        } finally {
          console.error = originalError;
        }
      } else {
        userMessage(
          "Z80 CPU tests cannot run - Z80CPUEmulatorTestClass class not available"
        );
        // Debug information
        userMessage(
          `Available globals: Z80CPU=${typeof Z80CPU}, Z80Assembler=${typeof Z80Assembler}, runZ80CPUEmulatorTestClass=${typeof runZ80CPUEmulatorTestClass}`
        );
      }
    } catch (error) {
      userMessageAboutBug("Z80 CPU test error", error.message);
    }

    // Enable easter egg after tests are complete
    this.easterEggEnabled = true;

    // Remove boot sequence click handler
    if (this.bootSequenceClickHandler) {
      this.screen.removeEventListener(
        "pointerdown",
        this.bootSequenceClickHandler
      );
      this.bootSequenceClickHandler = null;
    }

    // Set up easter egg click handler
    this.setupAnimationEasterEgg();
  }

  toggleSpeed() {
    const wasInFastMode = this.fastMode;
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
  createTimer(callback, interval, isInterval = true) {
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
    this.activeTimers.forEach((id) => {
      clearInterval(id);
      clearTimeout(id);
    });
    this.activeTimers.clear();
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
        } else {
          // In fast mode, make screen black
          if (this.screen) {
            this.screen.textContent = "";
            // Reset screen elements cache so it rebuilds when exiting fast mode
            this.screenElements = [];
          }
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
    if (!this.screen) {
      userMessageAboutBug(
        "Screen update failed - screen element not found",
        "updateScreen() called but screen element missing from DOM"
      );
      return;
    }

    // Initialize screen elements cache if needed
    if (this.screenElements.length === 0) {
      this.initializeScreenElements();
    }

    // Only update changed characters (or if cache is invalid)
    for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
      const newByte = this.memory[SCREEN_START + i];
      if (!this.lastScreenStateIsValid || this.lastScreenState[i] !== newByte) {
        this.updateCharacterAt(i, newByte);
        this.lastScreenState[i] = newByte;
      }
    }

    // Mark cache as valid after updating
    if (!this.lastScreenStateIsValid) {
      this.lastScreenStateIsValid = true;
    }
  }

  invalidateScreenCache() {
    // Mark screen state cache as invalid to force re-render
    this.lastScreenStateIsValid = false;
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

    if (byte >= 128) {
      element.classList.add("inverted");
    } else {
      element.classList.remove("inverted");
    }

    if (this.useSinclairFont && !sinclairBlockChars.includes(byte)) {
      element.classList.add("sinclair-font");
    } else {
      element.classList.remove("sinclair-font");
    }
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
    // Direct lookup from single canonical charset
    if (byte >= 0 && byte <= 255) {
      return this.sinclairByteToUnicodeNeverInverts[byte] || "?";
    }
    return "?";
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
    // Fallback: map unknown char to space to avoid injecting NULs
    // Consider reporting via userMessageAboutBug
    return this.unicodeToSinclair(" ");
  }

  updateHardwareDisplay() {
    const regs = this.cpu.registers;

    if (!regs) {
      userMessageAboutBug("CPU registers are undefined");
      return;
    }

    if (this.pcDisplay) {
      this.pcDisplay.textContent = regs.PC.toString(16)
        .padStart(4, "0")
        .toUpperCase();
    }
    if (this.spDisplay) {
      this.spDisplay.textContent = regs.SP.toString(16)
        .padStart(4, "0")
        .toUpperCase();
    }
    if (this.stackContentsDisplay) {
      // Display the next 2 words that would be popped from the stack
      const abovebottom = this.cpu.readWordFromMemory(
        this.memory,
        this.cpu.adjustFFFF(regs.SP + 2)
      );
      const bottomword = this.cpu.readWordFromMemory(this.memory, regs.SP);
      this.stackContentsDisplay.textContent =
        "+2:" +
        abovebottom.toString(16).padStart(4, "0").toUpperCase() +
        " " +
        "SP:" +
        bottomword.toString(16).padStart(4, "0").toUpperCase();
    }
    if (this.regADisplay) {
      this.regADisplay.textContent = regs.A.toString(16)
        .padStart(2, "0")
        .toUpperCase();
    }
    if (this.regBCDisplay) {
      this.regBCDisplay.textContent =
        regs.B.toString(16).padStart(2, "0").toUpperCase() +
        regs.C.toString(16).padStart(2, "0").toUpperCase();
    }
    if (this.regDEDisplay) {
      this.regDEDisplay.textContent =
        regs.D.toString(16).padStart(2, "0").toUpperCase() +
        regs.E.toString(16).padStart(2, "0").toUpperCase();
    }
    if (this.regHLDisplay) {
      this.regHLDisplay.textContent =
        regs.H.toString(16).padStart(2, "0").toUpperCase() +
        regs.L.toString(16).padStart(2, "0").toUpperCase();
    }
    if (this.flagCDisplay) {
      this.flagCDisplay.textContent = regs.F.C ? "1" : "0";
    }
    if (this.flagZDisplay) {
      this.flagZDisplay.textContent = regs.F.Z ? "1" : "0";
    }
    if (this.currentInstructionDisplay) {
      // Show 4 bytes at PC as hex in 2 lines: 2 bytes each
      const bytes = [];
      for (let i = 0; i < 4; i++) {
        const addr = (regs.PC + i) & 0xffff;
        bytes.push(
          this.memory[addr].toString(16).padStart(2, "0").toUpperCase()
        );
      }
      // Format as 2 lines: "XX XX\nXX XX"
      const line1 = bytes.slice(0, 2).join(" ");
      const line2 = bytes.slice(2, 4).join(" ");
      this.currentInstructionDisplay.textContent = line1 + " " + line2;
    }
    if (this.portsDisplay) {
      // Display ports 0-3 (Frame, Keyboard, BeepHz, BeepMs)
      const portValues = [];
      for (let port = 0; port < 4; port++) {
        const value = this.ioMap[port];
        portValues.push(value.toString(16).padStart(2, "0").toUpperCase());
      }
      this.portsDisplay.textContent = portValues.join(" ");
    }
    if (this.keyCodeCurrentDisplay) {
      if (this.keyCodeCurrent === null) {
        this.keyCodeCurrentDisplay.textContent = "--";
      } else {
        const hex = formatHex2(this.keyCodeCurrent);
        this.keyCodeCurrentDisplay.textContent = this.keyCodeCurrentReleased
          ? `(${hex})`
          : hex;
      }
    }
    if (this.mipsDisplay) {
      if (typeof this.mipsValue === "number") {
        this.mipsDisplay.textContent =
          this.mipsValue < 10
            ? this.mipsValue.toFixed(1)
            : Math.round(this.mipsValue);
      } else {
        this.mipsDisplay.textContent = this.mipsValue;
      }
    }
    if (this.refreshRateDisplay) {
      this.refreshRateDisplay.textContent = Math.round(this.refreshRate);
    }
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

  clearMagazineListing() {
    const machineCodeDiv = document.getElementById("machineCode");
    if (machineCodeDiv) {
      machineCodeDiv.textContent = "";
      machineCodeDiv.classList.remove("error");
    }
  }

  clearAssembly() {
    this.setAssemblyCode("");
    this.clearAddressAndOpcodesColumns();
    this.clearMagazineListing();
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

    const assemblySection = document.querySelector(".assembly-section");
    if (!assemblySection) {
      userMessageAboutBug(
        "Assembly section not found",
        "updateButtonVisibility() called but .assembly-section element not found in DOM"
      );
      return;
    }

    const code = this.getAssemblyCode();
    const isAssemblyAreaClear = !code || code.trim().length === 0;

    // Only update if the empty/not-empty state has changed
    if (this.lastIsAssemblyAreaClear !== isAssemblyAreaClear) {
      // Remove all state classes first
      assemblySection.classList.remove(
        "assembly-empty-state",
        "assembly-content-state"
      );

      // Apply the appropriate state class
      if (isAssemblyAreaClear) {
        // Empty state: show only load buttons
        assemblySection.classList.add("assembly-empty-state");
      } else {
        // Content state: show clear and assemble buttons
        assemblySection.classList.add("assembly-content-state");
      }

      // Update the tracked state
      this.lastIsAssemblyAreaClear = isAssemblyAreaClear;
    }
  }

  loadAssemblyCode(code) {
    if (!code) return;

    // Remove first line feed if it's followed by non-blank content
    if (code.startsWith("\n") && code.length > 1 && code[1].trim() !== "") {
      code = code.substring(1);
    }

    // Clear everything first, then load new code
    this.clearAssembly();
    this.setAssemblyCode(code);
  }

  loadDefaultAssembly() {
    this.loadAssemblyCode(
      typeof DEFAULT_ASM !== "undefined" ? DEFAULT_ASM : null
    );
  }
  loadBasicsAssembly() {
    this.loadAssemblyCode(
      typeof BASICS_ASM !== "undefined" ? BASICS_ASM : null
    );
  }
  loadSpaceInvaderAssembly() {
    this.loadAssemblyCode(
      typeof SPACE_INVADER_ASM !== "undefined" ? SPACE_INVADER_ASM : null
    );
  }

  // Update assembly display to show hex addresses and opcodes when in stepping mode
  updateAssemblyDisplayForStepping() {
    this.updateAddressAndOpcodesColumns();
  }

  assembleAndRun() {
    const sourceCode = this.getAssemblyCode();
    const machineCodeDiv = document.getElementById("machineCode");
    const assembler = new Z80Assembler();
    const result = assembler.assemble(sourceCode);
    this.loadAddress = result.loadAddress;

    if (result.success) {
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
      this.instructionDetails = result.instructionDetails || [];

      // Load machine code into memory using shared memory loading function
      Z80Assembler.loadOpcodesIntoMemory(this.memory, this.instructionDetails);

      // Clear the screen when assembling and running
      this.clearScreen();

      if (this.state === STATE.FREE_RUNNING) {
        // Hot-reload case: preserve CPU state, just inform user
        userMessage("Code hot-reloaded - may need Reset to run properly");
        sinclaude.cpu.set(this.loadAddress);
      } else {
        sinclaude.cpu.set(this.loadAddress, 0xffff);
        this.setState(STATE.FREE_RUNNING);
      }
      this.lastPC = null;

      machineCodeDiv.textContent = assembler.generateMachineCodeListing(
        result.instructionDetails,
        result.loadAddress
      );

      // Update all editor columns with new instruction details
      this.updateAssemblyDisplayForStepping();

      // Show address and opcodes columns on successful assembly
      this.showAddressOpcodesColumns();

      machineCodeDiv.classList.remove("error");

      // Update URL with encoded program
      this.updateURL(sourceCode);

      // Focus execution area to enable keyboard capture UX
      const executionSection = document.querySelector(".execution-section");
      if (executionSection) {
        executionSection.focus();
        executionSection.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    } else {
      // Clear instruction details on assembly failure
      this.instructionDetails = [];

      // Show all errors in machine code window
      let errorText = "Assembly Errors:\n\n";
      if (result.errors) {
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
      } else {
        errorText += result.error || "Unknown error";
      }
      machineCodeDiv.textContent = errorText;
      machineCodeDiv.classList.add("error");
      this.setState(STATE.NOT_READY);
    }
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

    try {

      const newUrl = new URL(window.location);

      if (desiredEncoded === null) {
        // Remove asm parameter when clearing
        newUrl.searchParams.delete("asm");
      } else {
        // Set asm parameter when there's code
        const maxUrlLength = 2000; // supposed to be 32K but erring at a lot less
        const baseUrl =
          window.location.origin + window.location.pathname + "?asm=";
        const totalLength = baseUrl.length + desiredEncoded.length;

        if (totalLength > maxUrlLength) {
          const overage = totalLength - maxUrlLength;
          userMessage(
            `Source code was not encoded on URL because it's too large (${totalLength} bytes, ${overage} over ${maxUrlLength} limit). See Docs.`
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
    } catch (e) {
      userMessageAboutBug("Failed to update URL", e.message);
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
    const previousState = this.state;
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

    // Disable easter egg when entering execution states
    if (newState === STATE.FREE_RUNNING || newState === STATE.STEPPING) {
      this.easterEggEnabled = false;
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
    const essentialTimers = new Set([
      this.displayUpdateInterval,
      this.runLoopInterval,
      this.versionCheckInterval,
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
    // at 1 mips, 1/60 of a second is 16,000 instructions
    // closest prime so i doesnt sync with refresh rate
    const numberOfInstructions = 15991;
    while (performance.now() < endTime) {
      const result = this.cpu.executeSteps(
        this.memory,
        this.ioMap,
        numberOfInstructions,
        this.cpu.registers
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
    let instructionsExecuted =
      this.instructionCount - this.mipsInstructionCount;
    if (instructionsExecuted < 0) instructionsExecuted = 0;

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
    } else if (this.state === STATE.STEPPING) {
      // Execute one instruction in stepping mode
      this.executeOneInstruction();
    }
  }

  executeOneInstruction() {
    const result = this.cpu.executeSteps(
      this.memory,
      this.ioMap,
      1,
      this.cpu.registers
    );
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
    if (this.highlightedPC === this.cpu.registers.PC) {
      return;
    }

    this.highlightedPC = this.cpu.registers.PC;

    // Find the last source line that corresponds to the current PC (to skip labels)
    let targetLine = null;
    for (let i = 0; i < this.instructionDetails.length; i++) {
      const detail = this.instructionDetails[i];
      if (detail && detail.startAddress === this.highlightedPC) {
        targetLine = i;
      } else if (
        detail &&
        detail.startAddress !== null &&
        detail.startAddress > this.highlightedPC
      ) {
        break;
      }
    }

    // Clear any existing highlights first
    this.clearHighlight();

    // Only highlight if we found a matching line
    if (targetLine !== null && this.assemblyColumn) {
      // Save cursor position before modifying content
      const selection = window.getSelection();
      let savedRange = null;
      if (
        selection.rangeCount > 0 &&
        this.assemblyColumn.contains(selection.anchorNode)
      ) {
        savedRange = selection.getRangeAt(0).cloneRange();
      }

      // Add CSS class-based highlighting for the 3-column editor
      const lines = this.getAssemblyCode().split("\n");
      if (targetLine < lines.length) {
        // Create a highlighted version of the content
        const highlightedLines = lines.map((line, index) => {
          if (index === targetLine) {
            return `<span class="highlighted-line">${this.escapeHtml(
              line
            )}</span>`;
          }
          return this.escapeHtml(line);
        });

        this.assemblyColumn.innerHTML = highlightedLines.join("\n");

        // Restore cursor position if it was saved
        if (savedRange) {
          try {
            selection.removeAllRanges();
            selection.addRange(savedRange);
          } catch (e) {
            // If restoring cursor fails, place it at the end
            this.setCursorToEnd();
          }
        }

        // Scroll the highlighted line into view if not currently editing
        // Only scroll if it won't move the step button out of view
        if (!savedRange) {
          if (fancy_highlight_scroll) {
            scrollNearestKeepAnchorVisible(
              ".highlighted-line",
              "#executionControls button"
            );
          } else {
            const highlightedElement =
              this.assemblyColumn.querySelector(".highlighted-line");
            const stepButton = document.querySelector(
              "#executionControls button"
            );

            if (highlightedElement && stepButton) {
              const elementRect = highlightedElement.getBoundingClientRect();
              const buttonRect = stepButton.getBoundingClientRect();

              // Calculate how far we'd scroll and if button would stay visible
              const scrollTarget = elementRect.top - window.innerHeight / 2;
              const buttonAfterScroll = buttonRect.top - scrollTarget;

              // Only scroll if step button will remain in viewport after scroll
              if (
                buttonAfterScroll > 0 &&
                buttonAfterScroll < window.innerHeight
              ) {
                highlightedElement.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }
          }
        }
      }
    }
  }

  setCursorToEnd() {
    if (this.assemblyColumn) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(this.assemblyColumn);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  clearHighlight() {
    if (this.assemblyColumn) {
      const currentCode = this.getAssemblyCode();
      this.assemblyColumn.textContent = currentCode;

      // If the user was editing, restore cursor to end
      if (document.activeElement === this.assemblyColumn) {
        this.setCursorToEnd();
      }
    }
    this.highlightedPC = null;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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

    // Find the expansion handler for this element
    const expandedElements = document.querySelectorAll(".expanded-element");
    const isAlreadyExpanded = Array.from(expandedElements).some(
      (el) => el === targetElement
    );

    if (isAlreadyExpanded) {
      // Element is already expanded, restore it
      this.restoreElement(targetElement.id);
    } else {
      // Expand the element
      this.performExpansion(targetElement);
    }
  }

  performExpansion(element) {
    // Store original styles
    const originalStyles = {
      position: element.style.position || "",
      top: element.style.top || "",
      left: element.style.left || "",
      width: element.style.width || "",
      height: element.style.height || "",
      zIndex: element.style.zIndex || "",
    };
    element.dataset.originalStyles = JSON.stringify(originalStyles);

    // Hide columns when maximizing the editing area
    this.hideAddressOpcodesColumns();

    // Create and show restore note
    const noteHowToRestoreSize = document.createElement("div");
    noteHowToRestoreSize.id = "expandnoteHowToRestoreSize";
    noteHowToRestoreSize.className = "restore-size-note";
    noteHowToRestoreSize.textContent = "Touch to restore size";
    noteHowToRestoreSize.style.zIndex = Z_INDEX.RESTORE_MESSAGE;
    noteHowToRestoreSize.addEventListener("pointerdown", () =>
      this.restoreElement(element.id)
    );
    document.body.appendChild(noteHowToRestoreSize);

    element.style.position = "fixed";
    element.style.top = "4vh";
    element.style.left = "0";
    element.style.width = "100vw";
    element.style.height = "96vh";
    element.style.zIndex = Z_INDEX.EXPANDED_ELEMENT;
    element.classList.add("expanded-element");

    // Prevent window scrolling when textarea is expanded
    const textarea = element.querySelector("textarea");
    if (textarea) {
      const wheelHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      textarea.addEventListener("wheel", wheelHandler, { passive: false });
      // Store handler reference for cleanup
      textarea._expandedWheelHandler = wheelHandler;
    }
  }

  restoreElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      userMessageAboutBug(
        "Element restore failed - element not found",
        `restoreElement('${elementId}') called but element not found in DOM`
      );
      return;
    }

    // Restore original styles
    const originalStyles = JSON.parse(element.dataset.originalStyles || "{}");
    Object.keys(originalStyles).forEach((key) => {
      element.style[key] = originalStyles[key];
    });

    // Remove restore note
    const noteHowToRestoreSize = document.getElementById(
      "expandnoteHowToRestoreSize"
    );
    if (noteHowToRestoreSize) {
      noteHowToRestoreSize.remove();
    }

    // Clean up wheel event handler
    const textarea = element.querySelector("textarea");
    if (textarea && textarea._expandedWheelHandler) {
      textarea.removeEventListener("wheel", textarea._expandedWheelHandler);
      delete textarea._expandedWheelHandler;
    }

    element.classList.remove("expanded-element");
    delete element.dataset.originalStyles;
  }
}

window.buttonEditMode = false;

function toggleButtonCaptionEdit() {
  window.buttonEditMode = !window.buttonEditMode;
  const button_caption_edit_toggle = document.querySelector(
    ".button-caption-edit-toggle"
  );
  const gameButtons = document.querySelectorAll(".game-buttons button");

  if (window.buttonEditMode) {
    button_caption_edit_toggle.textContent =
      "Click here to end button customization";
    button_caption_edit_toggle.classList.add("active");
    gameButtons.forEach((button) => button.classList.add("edit-mode"));
  } else {
    button_caption_edit_toggle.textContent =
      "Customize button-to-key mapping";
    button_caption_edit_toggle.classList.remove("active");
    gameButtons.forEach((button) => button.classList.remove("edit-mode"));
  }
}
