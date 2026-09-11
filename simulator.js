const SCREEN_START = 60000;
const SCREEN_WIDTH = 32;
const SCREEN_HEIGHT = 24;
const MEMORY_SIZE = 65536;
const FRAME_COUNT_PORT = 0;
const KEYBOARD_PORT = 1;
const KEYSTROKE_PORT = 5;
const KBD_NO_KEY_PRESSED = -1;
const BEEP_10HZ_PORT = 2;
const BEEP_DURATION_PORT = 3;
const BEEP_VOLUME_PORT = 4;
const BEEP_DEFAULT_VOLUME = 85;

const MAX_URL_LENGTH = 2000; // supposed to be 32K but erring at a lot less
const BEEP_GAIN = 0.1;

// Retro graphics fill the cell without depending on a font's bearings or
// antialiasing. Bits describe top-left, top-right, bottom-left, bottom-right.
// ZX81 codes 0-7 equal that bit pattern; their inverses supply the other shapes.
const sinclairPlotMasks = new Map([
  [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
]);
// ZX81 codes 8-10: grey, grey lower half, grey upper half.
const ZX81_GREY_ROWS = new Map([[8, [0, 8]], [9, [4, 8]], [10, [0, 4]]]);
// Crisp SVG edges snap the monochrome pixels together even when browser zoom
// and display scaling put cell boundaries between device pixels.
function plotMarkup(size, inkSquares) {
  const unit = 8 / size;
  const path = inkSquares.map(([x, y]) => `M${x * unit} ${y * unit}h${unit}v${unit}h-${unit}z`).join('');
  return `<rect width="8" height="8" fill="var(--plot-paper)"/><path d="${path}" fill="var(--plot-ink)"/>`;
}

function plotBlockMarkup(mask) {
  const squares = [];
  for (let bit = 0; bit < 4; bit++) {
    if (mask & (1 << bit)) squares.push([bit % 2, bit >> 1]);
  }
  return plotMarkup(2, squares);
}

const sinclairPlotPatterns = new Map([...sinclairPlotMasks].map(([code, mask]) => [code, plotBlockMarkup(mask)]));
for (const [code, [top, bottom]] of ZX81_GREY_ROWS) {
  const dots = [];
  for (let y = top; y < bottom; y++) {
    for (let x = y % 2; x < 8; x += 2) dots.push([x, y]);
  }
  sinclairPlotPatterns.set(code, plotMarkup(8, dots));
}

// Named keys use explicit port values, separate from printable character codes.
const SPECIAL_KEYS = Object.entries(ZX81.keys).map(([name, sinclairCode]) => ({name, sinclairCode}));

const GAME_KEYS = ["W", "S", "Space", "A", "D"];

class Simulator {
  constructor(options = {}) {
    this.cpu = new Z80CPU();
    this.cpu.InPort = port => this.InPort(port);
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
    this.initializePreferences(options);

    this.useSinclairFont =
      localStorage.getItem(LOCALSTORAGE_RETRO_FONTS_KEY) !== "false";

    this.setupDOM();
    this.setupKeyboard();
    this.setupDisplayUpdates();
    this.initializeVersionChecking();
    this.setupCleanupHandlers();
    this.bootShow();
  }

  initializePreferences({ samples = [], defaultSampleId = "" } = {}) {
    this.samples = new Map(samples.map(sample => [sample.id, sample]));
    this.loadedSample = null;
    this.defaultSampleId = defaultSampleId;
    const stored = localStorage.getItem("simulatorPreferences");
    if (stored !== null) {
      try {
        const settings = JSON.parse(stored);
        if (settings.defaultSampleId !== "" && !this.samples.has(settings.defaultSampleId)) {
          throw new Error("Unknown startup sample");
        }
        this.defaultSampleId = settings.defaultSampleId;
      } catch (error) {
        userMessage("Could not restore simulator settings; using defaults. " + error.message);
      }
    }
  }

  savePreferences() {
    localStorage.setItem("simulatorPreferences", JSON.stringify({
      defaultSampleId: this.defaultSampleId,
    }));
  }

  setDefaultSample(id) {
    if (id !== "" && !this.samples.has(id)) {
      userMessage("Unknown startup sample: " + id);
      return false;
    }
    this.defaultSampleId = id;
    this.savePreferences();
    return true;
  }

  setupSampleControls() {
    const buttons = document.getElementById("sampleButtons");
    const select = document.getElementById("sampleSelect");
    const startup = document.getElementById("defaultSampleSelect");
    buttons.innerHTML = "";
    select.innerHTML = "";
    startup.innerHTML = "";
    const option = (parent, value, label) => {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      parent.appendChild(item);
      return item;
    };
    const placeholder = option(select, "", "Load a program...");
    placeholder.disabled = true;
    placeholder.hidden = true;
    option(startup, "", "Blank editor");
    for (const sample of this.samples.values()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "load-btn";
      button.textContent = "Load " + sample.name;
      button.addEventListener("click", () => this.loadSample(sample.id));
      buttons.appendChild(button);
      option(select, sample.id, sample.name);
      option(startup, sample.id, sample.name);
    }
    select.value = "";
    startup.value = this.defaultSampleId;
  }

  initializeCharacterMappings() {
    this.sinclairByteToUnicode = ZX81.characters;
    this.unicodeToSinclairMap = ZX81.codes;
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

    this.setupSampleControls();
    this.createGameButtons();

    // Setup assembly editor
    this.setupAssemblyEditor();

    this.setupCollapsibleSection(this.listingSection);
    this.setupCollapsibleSection(this.consoleSection);

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
    this.loadedSample = null;
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

    // Clear existing content
    gameButtonsDiv.innerHTML = "";
    GAME_KEYS.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = key;
      button.tabIndex = 0; // Make button focusable when clicked

      button.addEventListener("pointerdown", (e) => {
        this.buttonClick(button, `pointer:${e.pointerId}`);
        button.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      const releasePointer = (e) => {
        this.releaseKey(`pointer:${e.pointerId}`);
        e.preventDefault();
      };
      button.addEventListener("pointerup", releasePointer);
      button.addEventListener("pointercancel", releasePointer);
      button.addEventListener("lostpointercapture", releasePointer);
      button.addEventListener("keydown", e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          this.buttonClick(button);
        }
      });
      button.addEventListener("keyup", e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          this.releaseKey(button);
        }
      });
      button.addEventListener("blur", () => this.releaseKey(button));

      gameButtonsDiv.appendChild(button);
    });
  }

  setupKeyboard() {
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
      this.releaseAllKeys();
    };

    // Set initial state
    renderKeyboardStatus();

    // Desktop: Hover-based keyboard capture
    executionSection.addEventListener("mouseenter", activateCapture);
    executionSection.addEventListener("mouseleave", () => {
      if (document.activeElement !== this.touchKeyboard) deactivateCapture();
    });
    executionSection.addEventListener("focusin", activateCapture);
    executionSection.addEventListener("focusout", e => {
      if (!executionSection.contains(e.relatedTarget)) deactivateCapture();
    });
    window.addEventListener("blur", () => this.releaseAllKeys());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.releaseAllKeys();
    });

    // Mobile: Touch-based keyboard capture
    executionSection.addEventListener("pointerdown", activateCapture);

    // Document-level touch to detect touches outside execution section
    document.addEventListener("pointerdown", (e) => {
      if (!executionSection.contains(e.target)) {
        deactivateCapture();
      }
    });

    this.setupTouchKeyboard();

    // Hover capture must not steal input from the assembly editor either.
    const isTypingInFormField = (e) =>
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY"].includes(e.target.tagName) || e.target.isContentEditable;
    // e.code identifies the physical key even if Shift changes e.key before keyup.
    const keyId = (e) => `keyboard:${e.code || e.key}`;

    // Document-level keyboard capture - only process when capture is active
    document.addEventListener("keydown", (e) => {
      if (this.keyboardCaptureActive && !isTypingInFormField(e)) {
        this.pressKey(keyId(e), e.key);
        e.preventDefault(); // Prevent default browser behavior
      }
    });

    document.addEventListener("keyup", (e) => {
      // Release a tracked key even if focus moved to an input after keydown.
      this.releaseKey(keyId(e));
      if (this.keyboardCaptureActive && !isTypingInFormField(e)) {
        e.preventDefault();
      }
    });
  }

  setupTouchKeyboard() {
    const input = this.touchKeyboard = document.getElementById("touchKeyboard");
    // Phone keyboards can emit text/composition events without usable keydown events.
    const sendText = () => {
      const text = input.value;
      input.value = "";
      if (!this.keyboardCaptureActive || this.audioStartPrompt) return;
      for (const key of text) this.tapKey(key === "\n" ? "Enter" : key);
    };
    input.addEventListener("compositionstart", () => { this.touchComposing = true; });
    input.addEventListener("compositionend", e => {
      this.touchComposing = false;
      if (e.data) sendText();
      else input.value = "";
    });
    input.addEventListener("input", e => {
      if (!this.touchComposing && !e.isComposing) sendText();
    });
    input.addEventListener("keydown", e => {
      if (e.isComposing || this.touchComposing || e.key === "Enter") return;
      if (this.keyboardCaptureActive && !this.audioStartPrompt &&
          this.specialKeysByName.has(e.key.toLowerCase())) {
        e.preventDefault();
        this.tapKey(e.key);
      }
    });
    input.addEventListener("blur", () => {
      this.touchComposing = false;
      input.value = "";
    });
  }

  tapKey(label) {
    const keyId = Symbol("typed key");
    if (this.pressKey(keyId, label)) {
      // Text input has no held-key duration; allow polling programs to see the tap.
      this.createTimer(() => this.releaseKey(keyId), 100, false);
    }
  }

  initializeKeyMappings() {
    this.specialKeysByName = new Map(SPECIAL_KEYS.map((key) => [key.name.toLowerCase(), key]));
    this.heldKeys = new Map();
    this.keyQueue = [];
    this.releaseAllKeys();
  }

  labelToSinclairCodeOrNull(label) {
    if (!label || typeof label !== "string") {
      return null;
    }

    const special = this.specialKeysByName.get(label.toLowerCase());
    if (special) return special.sinclairCode;

    // Printable text and named controls have separate ZX81 mappings.
    if (label.length === 1) {
      const code = this.unicodeToSinclairMap.get(label.toUpperCase());
      if (code !== undefined) return code;
    }

    return null;
  }

  buttonClick(button, keyId = button) {
    // The button caption names the key to press
    const value = button.textContent.trim();

    if (!this.pressKey(keyId, value)) {
      userMessageAboutBug(
        "Cannot press key",
        `Invalid configuration "${value}"`
      );
    }
  }

  pressKey(keyId, label) {
    const code = this.labelToSinclairCodeOrNull(label);
    if (code === null) return false;
    // Repeats must not make an older held key take precedence over a newer press.
    if (!this.heldKeys.has(keyId)) {
      this.heldKeys.set(keyId, code);
      this.keyQueue.push(code);
      this.updateHeldKey();
    }
    return true;
  }

  releaseKey(keyId) {
    if (this.heldKeys.delete(keyId)) this.updateHeldKey();
  }

  updateHeldKey() {
    this.setKey(this.heldKeys.size === 0
      ? KBD_NO_KEY_PRESSED : Array.from(this.heldKeys.values()).at(-1));
  }

  releaseAllKeys() {
    this.heldKeys.clear();
    this.keyQueue.length = 0;
    this.touchComposing = false;
    if (this.touchKeyboard) this.touchKeyboard.value = "";
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
    if (this.audioMuted || duration === 0 || volume === 0 || !this.audioContext || this.audioContext.state !== "running") {
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
    // Discrete input survives a complete press/release between CPU batches.
    if (port === KEYSTROKE_PORT) return this.keyQueue.length ? this.keyQueue.shift() : 255;
    return this.ioMap[port];
  }

  setKey(keyCode) {
    this.keyCodeCurrentReleased = keyCode === KBD_NO_KEY_PRESSED;
    if (!this.keyCodeCurrentReleased) {
      this.keyCodeCurrent = keyCode;
    }

    this.OutPort(KEYBOARD_PORT, keyCode & 0xff);
  }

  bootShow() {
    // Define stage configuration (stage function, duration in ms before start the next one)
    // duration -1 means last one
    this.stageConfig = [
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
    this.clearTimer(this.currentStageTimer);
    this.currentStageTimer = null;
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
    const onTimeout = () => {
      this.activeTimers.delete(timerId);
      callback();
    };
    const timerId = isInterval
      ? setInterval(callback, interval)
      : setTimeout(onTimeout, interval);
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
    // One rasterization surface keeps adjacent cells on the same device-pixel
    // grid. Separate SVG viewports can round their edges differently at zoom.
    this.plotScreen = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.plotScreen.setAttribute("class", "plot-screen");
    this.plotScreen.setAttribute("viewBox", "0 0 256 192");
    this.plotScreen.setAttribute("preserveAspectRatio", "none");
    this.plotScreen.setAttribute("shape-rendering", "crispEdges");
    this.screen.appendChild(this.plotScreen);

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
    const code = byte & 0x7f;
    const plot = sinclairPlotPatterns.has(code);

    if (plot) {
      if (!element.plotElement) {
        element.textContent = "";
        element.plotElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
        element.plotElement.setAttribute("transform", `translate(${index % SCREEN_WIDTH * 8} ${Math.floor(index / SCREEN_WIDTH) * 8})`);
        this.plotScreen.appendChild(element.plotElement);
      }
      // Inversion changes the inherited colors, not the shape or its DOM.
      if (element.plotCode !== code) element.plotElement.innerHTML = sinclairPlotPatterns.get(code);
      element.plotElement.setAttribute("class", byte >= 128 ? "plot-cell inverted" : "plot-cell");
      element.plotCode = code;
    } else {
      if (element.plotElement) {
        element.plotElement.remove();
        delete element.plotElement;
      }
      element.textContent = this.sinclairToUnicode(byte);
      delete element.plotCode;
    }
    element.classList.toggle("inverted", byte >= 128 && byte < 192);
    element.classList.toggle("plot-graphics", plot);
    element.classList.toggle(
      "sinclair-font",
      this.useSinclairFont && !plot
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
    return ZX81.decodeCharacter(byte);
  }

  setUseSinclairFont(useSinclairFont) {
    this.useSinclairFont = useSinclairFont;
    localStorage.setItem(LOCALSTORAGE_RETRO_FONTS_KEY, String(useSinclairFont));
    this.invalidateScreenCache();
  }

  // Modern Unicode character → Sinclair byte code conversion (O(1) via reverse lookup map)
  unicodeToSinclair(char) {
    return ZX81.encodeCharacter(char);
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

  clearAssembly({ preserveURL = false } = {}) {
    this.cancelAudioStart();
    this.releaseAllKeys();
    this.setAssemblyCode("");
    this.clearAddressAndOpcodesColumns();
    this.setMagazineListing("", false);
    this.instructionDetails = [];
    this.setState(STATE.NOT_READY);
    if (!preserveURL) this.updateURL("");
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

  loadAssemblyCode(code, options) {
    // Remove first line feed if it's followed by non-blank content
    if (code.startsWith("\n") && code.length > 1 && code[1].trim() !== "") {
      code = code.substring(1);
    }

    // Clear everything first, then load new code
    this.clearAssembly(options);
    this.setAssemblyCode(code);
  }

  loadDefaultAssembly() {
    if (this.defaultSampleId === "") {
      this.clearAssembly({ preserveURL: true });
    } else {
      this.loadSample(this.defaultSampleId, { preserveURL: true });
    }
  }

  loadSample(id, { preserveURL = false } = {}) {
    const sample = this.samples.get(id);
    if (sample === undefined) {
      userMessage("Unknown sample: " + id);
      return false;
    }
    this.loadAssemblyCode(sample.source, { preserveURL: true });
    // Remember explicit selection; pasted source is never recognized as a sample.
    this.loadedSample = { id, source: this.getAssemblyCode() };
    if (!preserveURL) this.updateURL(this.getAssemblyCode());
    return true;
  }

  loadProgramFromSelect(select) {
    if (this.loadSample(select.value)) select.value = "";
  }

  assembleAndRun({ muted = false } = {}) {
    this.cancelAudioStart();
    this.audioMuted = muted;
    // Boot screens and benchmarks must not overwrite or interrupt a user program.
    this.finishBootSequence();
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
    this.releaseAllKeys();
    this.resetBeepPorts();
    this.initializeAudio();

    // Store instruction details for opcode display and line mapping
    this.instructionDetails = result.instructionDetails;
    this.renderAssemblyLines();

    // Clear stale screen contents before loading any explicit screen data or code.
    this.clearScreen();
    Z80Assembler.loadOpcodesIntoMemory(this.memory, this.instructionDetails);

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
    if (this.isUrlUpdateDisabled()) return;

    // Comparing with the loaded copy only detects edits; it does not identify code.
    if (this.loadedSample && this.loadedSample.source !== sourceCode) this.loadedSample = null;
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete("run");
    if (sourceCode && this.loadedSample) {
      newUrl.searchParams.set("sample", this.loadedSample.id);
      newUrl.searchParams.delete("asm");
    } else if (sourceCode) {
      newUrl.searchParams.delete("sample");
      newUrl.searchParams.set("asm", btoa(encodeURIComponent(sourceCode)));
      if (newUrl.href.length > MAX_URL_LENGTH) {
        userMessage("Source code was not encoded on URL because it's too large (" +
          newUrl.href.length + " characters, over the " + MAX_URL_LENGTH + " limit). See Docs.");
        // A failed save must not leave a link to different, older source.
        newUrl.searchParams.delete("asm");
      }
    }
    if (!sourceCode) {
      newUrl.searchParams.delete("sample");
      newUrl.searchParams.delete("asm");
    }
    if (newUrl.href === window.location.href) return;
    if (window.location.protocol === "file:") {
      userMessage("Saving program to query params not implemented for file://.");
      return;
    }
    try {
      window.history.replaceState(null, "", newUrl);
    } catch (error) {
      userMessageAboutBug("Failed to update URL history", error.message);
    }
  }

  loadFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const encoded = urlParams.get("asm");
      if (encoded && encoded !== "dont") {
        this.loadAssemblyCode(decodeURIComponent(atob(encoded)), { preserveURL: true });
        return true;
      }

      // Older run links select from the same catalog as current sample links.
      const id = urlParams.get("sample") ?? urlParams.get("run");
      if (id !== null) {
        if (!this.samples.has(id)) {
          userMessage("Unknown URL program '" + id + "'. Available samples: " +
            [...this.samples.keys()].join(", "));
          return false;
        }
        return this.loadSample(id, { preserveURL: true });
      }
    } catch (error) {
      userMessageAboutBug("Failed to load assembly program from custom URL", error.message);
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
    this.releaseAllKeys();
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
      this.cancelAudioStart();
      this.releaseAudioStartKey?.();
      this.clearAllTimers();
      this.cleanupAudio();
      this.cleanupObservers();
    });

    // Also clear on visibility change (tab switching)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clearNonEssentialTimers();
      }
      this.updateAudioState();
    });

    // URL autostart can leave audio blocked until a real click, tap, or keypress.
    const unlockAudio = () => {
      if (!this.audioStartPrompt && !this.audioMuted && !document.hidden && this.audioContext?.state === "suspended") {
        this.updateAudioState();
      }
    };
    document.addEventListener("click", unlockAudio, true);
    document.addEventListener("keydown", unlockAudio, true);
  }

  cleanupObservers() {
    // Disconnect MutationObserver
    if (this.assemblyObserver) {
      this.assemblyObserver.disconnect();
      this.assemblyObserver = null;
    }
  }

  initializeAudio() {
    try {
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioContext();
      }
      this.updateAudioState();
    } catch (error) {
      userMessage(`Audio initialization failed: ${error.message}`);
    }
  }

  programUsesSound() {
    const assembler = new Z80Assembler();
    const result = assembler.assemble(this.getAssemblyCode());
    if (!result.success) return false;

    return assembler.parsedLines.some(({ mnemonic, lineNum }) => {
      if (mnemonic?.toUpperCase() !== "OUT") return false;
      // Assembled operands resolve EQU names, expressions and numeric bases;
      // inspecting instruction lines excludes comments and data bytes.
      const port = result.instructionDetails[lineNum - 1].opcodes[1];
      return [BEEP_10HZ_PORT, BEEP_DURATION_PORT, BEEP_VOLUME_PORT].includes(port);
    });
  }

  autostart() {
    this.cancelAudioStart();
    this.finishBootSequence();
    this.stopContinuousExecution();
    this.audioMuted = false;
    // Silent programs and assembly errors need no sound interaction.
    if (!this.programUsesSound()) {
      this.assembleAndRun();
      return;
    }
    this.initializeAudio();
    const context = this.audioContext;
    if (!context || context.state === "running") {
      this.assembleAndRun();
      return;
    }

    const element = document.getElementById("audioStartPrompt");
    const message = document.getElementById("audioStartMessage");
    const soundButton = document.getElementById("startWithSound");
    const mutedButton = document.getElementById("startMuted");
    const prompt = { element };
    const begin = (muted = false) => {
      if (this.audioStartPrompt !== prompt) return;
      this.releaseAllKeys();
      this.assembleAndRun({ muted });
    };
    const onAudioState = () => {
      if (!document.hidden && context.state === "running") begin();
    };
    const startSound = async () => {
      try {
        await context.resume();
        onAudioState();
      } catch (error) {
        if (this.audioStartPrompt !== prompt) return;
        message.textContent = "Sound could not start. Try again or start muted.";
        userMessage(`Audio playback could not resume: ${error.message}`);
      }
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.target === mutedButton) begin(true);
      else startSound();
    };
    const onKey = (event) => {
      // Keep tab navigation and browser shortcuts available.
      if (event.key === "Tab" || event.ctrlKey || event.altKey || event.metaKey ||
          ["Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key) || /^F\d+$/.test(event.key)) {
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      this.consumeAudioStartKey(event.code || event.key);
      if (event.target === mutedButton && [" ", "Enter"].includes(event.key)) begin(true);
      else startSound();
    };
    prompt.cleanup = () => {
      element.removeEventListener("click", onClick);
      element.removeEventListener("keydown", onKey, true);
      context.removeEventListener("statechange", onAudioState);
    };
    this.audioStartPrompt = prompt;
    message.textContent = "Click or press a key to start with sound";
    element.hidden = false;
    element.addEventListener("click", onClick);
    element.addEventListener("keydown", onKey, true);
    context.addEventListener("statechange", onAudioState);
    this.clearScreen();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    soundButton.focus({ preventScroll: true });
    onAudioState();
  }

  cancelAudioStart() {
    const prompt = this.audioStartPrompt;
    if (!prompt) return;
    this.audioStartPrompt = null;
    prompt.cleanup();
    prompt.element.hidden = true;
  }

  consumeAudioStartKey(key) {
    this.releaseAudioStartKey?.();
    // The initiating key can keep repeating after the prompt is dismissed.
    const swallow = (event) => {
      if ((event.code || event.key) !== key) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keyup") this.releaseAudioStartKey();
    };
    const release = () => {
      document.removeEventListener("keydown", swallow, true);
      document.removeEventListener("keyup", swallow, true);
      window.removeEventListener("blur", release);
      this.releaseAudioStartKey = null;
    };
    this.releaseAudioStartKey = release;
    document.addEventListener("keydown", swallow, true);
    document.addEventListener("keyup", swallow, true);
    window.addEventListener("blur", release);
  }

  async updateAudioState() {
    const context = this.audioContext;
    if (!context || context.state === "closed") return;
    const hidden = document.hidden || this.audioMuted;
    try {
      // Queue every transition so a quick hide/show cannot lose a resume while
      // the preceding suspend is still pending.
      if (hidden) await context.suspend();
      else await context.resume();
    } catch (error) {
      userMessage(`Audio playback could not ${hidden ? "pause" : "resume"}: ${error.message}`);
    }
  }

  async cleanupAudio() {
    const context = this.audioContext;
    this.audioContext = null;
    if (!context || context.state === "closed") return;
    try {
      await context.close();
    } catch (error) {
      userMessage(`Audio cleanup failed: ${error.message}`);
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
        RUN_BATCH_INSTRUCTIONS,
        endTime
      );
      this.instructionCount += result.instructionsExecuted;

      // Check for beep port changes after Z80 execution
      this.handleBeepPortChange();

      if (result.error) {
        this.setState(STATE.STEPPING);
        this.lastPC = null;
        this.updateHardwareDisplay();
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
      () => {
        this.runLoopInterval = null;
        this.runLoop();
      },
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


}
