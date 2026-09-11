const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ZX81 = require('./zx81_charset.js');
const sources = ['zx81_charset.js', 'constants_and_css_vars.js', 'z80_assembler.js', 'z80_cpu_emulator.js',
  'character_set_asm.js', 'basics_asm.js', 'default_asm.js', 'space_invader_asm.js', 'claudasaur_asm.js', 'chess_asm.js', 'sample_programs.js', 'simulator.js']
  .map(file => fs.readFileSync(require.resolve('./' + file), 'utf8')).join('\n');
const initialization = fs.readFileSync(require.resolve('./initialization.js'), 'utf8');

// Stub browser services and presentation only. Assembly, CPU execution, URL loading,
// state transitions, button rendering, audio lifecycle and timers are the real code.
function fixture(url = 'https://example.test/simulator.html', storage = new Map(), extraSamples = []) {
  function eventTarget() {
    const listeners = new Map();
    return {
      classList: { toggle() {}, add() {} },
      children: [],
      _html: '',
      set innerHTML(value) { this._html = value; this.children = []; },
      get innerHTML() { return this._html; },
      appendChild(child) { this.children.push(child); },
      setPointerCapture() {},
      focus() {}, scrollIntoView() {},
      addEventListener(type, callback, options = false) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add({ callback, capture: options === true || options.capture === true });
      },
      removeEventListener(type, callback) {
        for (const entry of listeners.get(type) || []) {
          if (entry.callback === callback) listeners.get(type).delete(entry);
        }
      },
      emit(type, details = {}) {
        const event = { type, target: this, defaultPrevented: false, propagationStopped: false,
          preventDefault() { this.defaultPrevented = true; },
          stopImmediatePropagation() { this.propagationStopped = true; }, ...details };
        const entries = [...(listeners.get(type) || [])].sort((a, b) => b.capture - a.capture);
        for (const entry of entries) {
          if (listeners.get(type).has(entry)) entry.callback(event);
          if (event.propagationStopped) break;
        }
        return event;
      },
    };
  }
  const controls = eventTarget();
  const elements = new Map();
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const section = { focus() {}, scrollIntoView() {} };
  const execution = { querySelector: () => null, appendChild() {} };
  const audioUI = Object.fromEntries(['audioStartPrompt', 'audioStartMessage', 'startWithSound', 'startMuted']
    .map(id => [id, eventTarget()]));
  audioUI.audioStartPrompt.hidden = true;
  const documentStub = Object.assign(eventTarget(), {
    hidden: false,
    body: eventTarget(),
    documentElement: { style: { setProperty() {} } },
    getElementById: id => {
      if (audioUI[id]) return audioUI[id];
      if (id === 'executionControls') return controls;
      if (!elements.has(id)) elements.set(id, eventTarget());
      return elements.get(id);
    },
    querySelector: selector => selector === '.execution-section' ? section : execution,
    createElement: eventTarget,
  });
  const windowStub = Object.assign(eventTarget(), { location: new URL(url), innerWidth: 1024 });
  windowStub.history = { replaceState(_state, _title, nextUrl) { windowStub.location = new URL(nextUrl); } };
  let nextId = 0, now = 0;
  const timers = new Map(), messages = [], bugs = [], contexts = [];
  const schedule = (callback, ms, repeat) => {
    const id = ++nextId;
    timers.set(id, { callback, ms, repeat });
    return id;
  };
  class AudioStub {
    constructor() {
      Object.assign(this, eventTarget());
      this.state = 'suspended';
      this.calls = [];
      this.notes = 0;
      contexts.push(this);
    }
    async suspend() { this.calls.push('suspend'); this.state = 'suspended'; this.emit('statechange'); }
    async resume() { this.calls.push('resume'); this.state = 'running'; this.emit('statechange'); }
    async close() { this.calls.push('close'); this.state = 'closed'; }
    createOscillator() {
      this.notes++;
      return { frequency: {}, connect() {}, start() {}, stop() {} };
    }
    createGain() { return { gain: {}, connect() {} }; }
  }
  const context = vm.createContext({
    window: windowStub, document: documentStub, localStorage, URL, URLSearchParams, btoa, atob,
    AudioContext: AudioStub, performance: { now: () => ++now },
    setTimeout: (callback, ms) => schedule(callback, ms, false),
    setInterval: (callback, ms) => schedule(callback, ms, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    userMessage: message => messages.push(message),
    userMessageAboutBug: (message, detail) => bugs.push({ message, detail }),
  });
  const { Simulator, Z80CPU, STATE, SIMULATOR_SAMPLES } = vm.runInContext(
    sources + '\n({Simulator, Z80CPU, STATE, SIMULATOR_SAMPLES});', context);
  const catalog = { ...SIMULATOR_SAMPLES, samples: [...SIMULATOR_SAMPLES.samples, ...extraSamples] };
  const sim = Object.create(Simulator.prototype);
  Object.assign(sim, {
    cpu: new Z80CPU(), memory: new Uint8Array(65536), ioMap: new Uint8Array(256),
    activeTimers: new Set(), runLoopInterval: null, displayUpdateInterval: null,
    instructionCount: 0, mipsInstructionCount: 0, state: STATE.NOT_READY,
    instructionDetails: [], assemblyColumn: { textContent: '' }, screen: eventTarget(),
    renderAssemblyLines() {}, updateAddressAndOpcodesColumns() {},
    clearAddressAndOpcodesColumns() {}, showAddressOpcodesColumns() {},
    setMagazineListing(text, isError) { this.listing = { text, isError }; },
    updateHardwareDisplay() { this.displayedPC = this.cpu.PC; },
  });
  sim.initializeCharacterMappings();
  sim.initializeKeyMappings();
  sim.initializePreferences(catalog);
  sim.setupSampleControls();
  sim.createGameButtons();
  sim.cpu.InPort = port => sim.InPort(port);
  sim.setupCleanupHandlers();
  return {
    sim, STATE, timers, windowStub, documentStub, contexts, controls, messages, bugs, audioUI, storage,
    initialize() {
      sim.setupAssemblyContentObserver = () => {};
      vm.runInNewContext(initialization, {
        window: windowStub, Simulator: function() { return sim; },
        updateRetroFontsToggle() {}, URLSearchParams, SIMULATOR_SAMPLES: catalog,
      });
      windowStub.emit('load');
    },
    fire(id) {
      const timer = timers.get(id);
      assert.ok(timer, 'Timer must still be scheduled');
      if (!timer.repeat) timers.delete(id);
      timer.callback();
    },
  };
}

async function main() {
  const boot = fixture();
  const bootCalls = [];
  const stages = ['benchmarkCPU', 'showSinclairCopyright', 'reportInstructionSetAnalysis', 'runAssemblerTests', 'runZ80CPUTests'];
  for (const name of stages) boot.sim[name] = () => bootCalls.push(name);
  boot.sim.bootShow();
  while (boot.sim.currentStageTimer !== null) boot.fire(boot.sim.currentStageTimer);
  assert.deepEqual(bootCalls, stages, 'Boot completes without the character-set display');
  assert.equal(boot.sim.isBootSequenceRunning, false);

  const card = fixture();
  card.sim.loadDefaultAssembly();
  assert.equal(card.sim.getAssemblyCode(), require('./character_set_asm.js'), 'Default program is the character-set test');
  const choices = fixture();
  const gameKeys = current => Array.from(current.documentStub.getElementById('gameButtons').children, button => button.textContent);
  const chosenKeys = ['W', 'S', 'Space', 'A', 'D'];
  const programs = [['characterSet','character_set_asm.js'], ['basics','basics_asm.js'],
    ['performance','default_asm.js'], ['spaceInvader','space_invader_asm.js'], ['claudasaur','claudasaur_asm.js'], ['chess','chess_asm.js']];
  for (const [value, file] of programs) {
    const option = { value };
    choices.sim.loadProgramFromSelect(option);
    assert.equal(choices.sim.getAssemblyCode(), require('./' + file).trimStart(), `Program list loads ${file}`);
    assert.equal(option.value, '', 'Program can be selected again');
    assert.deepEqual(gameKeys(choices), chosenKeys, 'Loading any sample preserves the game buttons');
    assert.equal(choices.windowStub.location.searchParams.get('sample'), value, 'Every sample gets a short link');
    for (const parameter of ['sample', 'run']) {
      const linked = fixture('https://example.test/simulator.html?' + parameter + '=' + value, choices.storage);
      linked.initialize();
      assert.equal(linked.sim.getAssemblyCode(), require('./' + file).trimStart());
      assert.notEqual(linked.sim.state, linked.STATE.NOT_READY, 'All current and legacy sample links autostart');
      assert.deepEqual(gameKeys(linked), chosenKeys);
      assert.equal(linked.windowStub.location.searchParams.get('sample'), value, 'Links use the current sample parameter');
      assert.equal(linked.windowStub.location.searchParams.has('run'), false);
      assert.deepEqual(linked.bugs, []);
    }
  }
  const sampleButtons = choices.documentStub.getElementById('sampleButtons').children;
  const sampleOptions = choices.documentStub.getElementById('sampleSelect').children;
  assert.equal(sampleButtons.length, programs.length);
  assert.equal(sampleOptions.length, programs.length + 1);
  sampleButtons[1].emit('click');
  assert.equal(choices.windowStub.location.searchParams.get('sample'), 'basics', 'Generated buttons use the generic loader');
  choices.sim.setAssemblyCode('; 1.3K Chess - arbitrary comment\nHALT');
  assert.deepEqual(gameKeys(choices), chosenKeys, 'Source comments cannot configure controls');
  choices.storage.set('simulatorPreferences', JSON.stringify({
    keyboardLayout: 'full', customKeys: ['7', 'E'], defaultSampleId: 'basics',
  }));
  const settingsRefresh = fixture(undefined, choices.storage);
  assert.deepEqual(gameKeys(settingsRefresh), chosenKeys, 'Old keyboard preferences cannot restore the removed layouts');
  assert.equal(settingsRefresh.sim.defaultSampleId, 'basics', 'Existing startup preferences survive the keyboard simplification');
  assert.deepEqual(settingsRefresh.messages, []);
  settingsRefresh.sim.setDefaultSample('basics');
  assert.deepEqual(JSON.parse(choices.storage.get('simulatorPreferences')), { defaultSampleId: 'basics' });
  const defaultRefresh = fixture(undefined, choices.storage);
  defaultRefresh.initialize();
  assert.equal(defaultRefresh.sim.getAssemblyCode(), require('./basics_asm.js').trimStart());
  assert.equal(defaultRefresh.sim.state, defaultRefresh.STATE.NOT_READY, 'The startup preference loads without running');
  defaultRefresh.sim.setDefaultSample('');
  const blankRefresh = fixture(undefined, choices.storage);
  blankRefresh.initialize();
  assert.equal(blankRefresh.sim.getAssemblyCode(), '', 'Blank editor is a persistent startup choice');
  assert.equal(blankRefresh.sim.setDefaultSample('missing'), false);

  const added = fixture('https://example.test/simulator.html?sample=extra', new Map(),
    [{ id: 'extra', name: 'Extra sample', source: 'LD A,19\nHALT' }]);
  added.initialize();
  assert.equal(added.sim.cpu.registers.A, 19, 'A new catalog entry needs no simulator changes');
  assert.ok(added.documentStub.getElementById('sampleButtons').children.some(button => button.textContent === 'Load Extra sample'));
  added.sim.assemblyColumn.textContent = 'LD A,23\nHALT';
  added.sim.assembleAndRun();
  assert.equal(added.sim.cpu.registers.A, 23);
  assert.equal(added.windowStub.location.searchParams.has('sample'), false, 'Editing invalidates sample provenance');
  assert.ok(added.windowStub.location.searchParams.has('asm'));
  const pasted = fixture();
  pasted.sim.loadAssemblyCode('LD A,19\nHALT');
  pasted.sim.assembleAndRun();
  assert.equal(pasted.windowStub.location.searchParams.has('sample'), false, 'Pasted source remains custom');
  assert.ok(pasted.windowStub.location.searchParams.has('asm'));
  pasted.sim.loadAssemblyCode(require('./basics_asm.js'));
  pasted.sim.assembleAndRun();
  assert.equal(pasted.windowStub.location.searchParams.has('sample'), false, 'Even an exact sample copy is not recognized by source');
  pasted.sim.updateURL(';' + 'x'.repeat(3000));
  assert.equal(pasted.windowStub.location.searchParams.has('asm'), false, 'An oversized save removes stale custom source too');

  const select = { value: 'characterSet' };
  card.sim.loadProgramFromSelect(select);
  assert.equal(select.value, '', 'The character-set program is selectable again after Clear');
  card.sim.memory[59999] = 91;
  card.sim.memory[60768] = 92;
  card.sim.assembleAndRun();
  assert.equal(card.sim.state, card.STATE.STEPPING, 'The completed test card remains on screen after HALT');
  assert.equal(card.sim.memory[59999], 91);
  assert.equal(card.sim.memory[60768], 92);
  const screen = card.sim.memory.slice(60000, 60768);
  assert.equal(ZX81.decode(screen.slice(0, 32)).trim(), 'CHARACTER SET TEST');
  for (let code = 0; code < 256; code++) {
    const row = 2 + Math.floor(code / 16);
    const col = Math.floor(code % 16 / 4) * 8 + 3 + code % 4;
    assert.equal(screen[row * 32 + col], code, `Character ${code} is displayed unchanged`);
  }
  for (let row = 18; row < 24; row++) {
    const cells = screen.slice(row * 32, (row + 1) * 32);
    assert.equal(ZX81.decode(cells.slice(0, 5)), `ROW${row}`);
    if (row >= 21) for (let col = 5; col < 32; col++) {
      assert.equal(cells[col], screen[(row - 3) * 32 + col] ^ 128, 'Negative lies directly below its pattern');
    }
  }
  const expectedPatterns = [
    ['######','######','######','######','######','######'],
    null, // Stipple uses an 8x8 bitmap per character, checked separately below.
    ['######','######','......','......','######','######'],
    ['######','......','######','......','######','......'],
    ['##..##','##..##','##..##','##..##','##..##','##..##'],
    ['#.#.#.','#.#.#.','#.#.#.','#.#.#.','#.#.#.','#.#.#.'],
    ['##..##','##..##','..##..','..##..','##..##','##..##'],
    ['#.#.#.','.#.#.#','#.#.#.','.#.#.#','#.#.#.','.#.#.#'],
    ['#....#','.#..#.','..##..','..##..','.#..#.','#....#'],
  ];
  const masks = new Map([[0,0],[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7]]);
  expectedPatterns.forEach((pattern, tile) => {
    for (let y = 0; y < 6; y++) {
      let actual = '';
      for (let x = 0; x < 6; x++) {
        const byte = screen[(18 + (y >> 1)) * 32 + 5 + tile * 3 + (x >> 1)];
        if (tile === 1) { assert.equal(byte, 8); continue; }
        const mask = masks.get(byte & 127) ^ (byte >= 128 ? 15 : 0);
        actual += mask & (1 << ((y % 2) * 2 + x % 2)) ? '#' : '.';
      }
      if (pattern) assert.equal(actual, pattern[y], `Pattern ${tile}, pixel row ${y}`);
    }
  });
  assert.equal(card.bugs.length, 0);

  const graphicsFixture = fixture();
  const graphics = graphicsFixture.sim;
  const classes = new Map();
  let graphic = '', graphicWrites = 0;
  graphicsFixture.documentStub.createElementNS = () => ({
    setAttribute() {}, remove() {},
    set innerHTML(value) { graphic = value; graphicWrites++; },
  });
  graphics.plotScreen = { appendChild() {} };
  graphics.screenElements = [{
    classList: { toggle(name, enabled) { classes.set(name, enabled); } },
  }];
  for (const retro of [false, true]) {
    graphics.useSinclairFont = retro;
    for (const byte of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 128]) {
      graphics.updateCharacterAt(0, byte);
      assert.equal(classes.get('sinclair-font'), false, 'Graphics never receive font stretching in either mode');
      assert.equal(classes.get('plot-graphics'), true);
      assert.equal(graphics.screenElements[0].textContent, '', 'Graphics contain no antialiased font glyph');
      assert.ok(graphic.includes('<rect width="8" height="8"'));
      assert.equal(classes.get('inverted'), byte >= 128);
    }
  }
  assert.ok(graphic.includes('d=""'), 'Inverse space fills the whole cell by inverting blank paper');
  graphics.updateCharacterAt(0, 135);
  assert.deepEqual([...graphic.matchAll(/M(\d+) (\d+)h4v4h-4z/g)].map(([, x, y]) => [Number(x), Number(y)]),
    [[0, 0], [4, 0], [0, 4]],
    'Inverse upper-left three-quarter block leaves only the bottom-right quadrant black');
  const writesBeforeInversion = graphicWrites;
  graphics.updateCharacterAt(0, 7);
  assert.equal(graphicWrites, writesBeforeInversion, 'Inverting a graphic reuses its SVG');
  graphics.updateCharacterAt(0, 8);
  const dots = [...graphic.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.equal(dots.length, 32);
  assert.ok(dots.every(([x, y]) => (x + y) % 2 === 0), 'Stipple is an alternating 8 by 8 bitmap');
  assert.equal(graphics.sinclairToUnicode(8), '\u2592', 'Stippled wall faces use the shade character');
  graphics.updateCharacterAt(0, 38);
  assert.equal(classes.get('sinclair-font'), true, 'Text retains the Sinclair font');
  assert.equal(classes.get('plot-graphics'), false);
  assert.equal(graphics.screenElements[0].plotCode, undefined, 'Writing text clears the graphics cache');
  assert.equal(graphics.screenElements[0].textContent, 'A');
  for (const [byte, glyph, inverse] of [[0, ' ', false], [32, '4', false],
    [160, '4', true], [166, 'A', true], [63, 'Z', false], [191, 'Z', true],
    [64, '⸮', false], [127, '⸮', false], [192, '⸮', false], [255, '⸮', false]]) {
    graphics.updateCharacterAt(0, byte);
    assert.equal(graphics.sinclairToUnicode(byte), glyph, `ZX81 glyph at ${byte}`);
    assert.equal(classes.get('inverted'), inverse, `Only valid ZX81 glyphs invert at ${byte}`);
    assert.equal(classes.get('plot-graphics'), byte === 0, 'ASCII space and its inverse are now digit 4');
  }
  for (const [byte, top] of [[9, 4], [10, 0]]) {
    graphics.updateCharacterAt(0, byte);
    const halfDots = [...graphic.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => [Number(x), Number(y)]);
    assert.equal(halfDots.length, 16);
    assert.ok(halfDots.every(([x, y]) => y >= top && y < top + 4 && (x + y) % 2 === 0));
  }
  graphics.updateCharacterAt(0, 8);
  graphics.useSinclairFont = false;
  graphics.updateCharacterAt(0, 8);
  assert.equal(classes.get('plot-graphics'), true, 'Turning retro fonts off keeps the graphics renderer');
  assert.equal(graphics.screenElements[0].plotCode, 8);
  assert.equal(graphics.screenElements[0].textContent, '');
  graphics.updateCharacterAt(0, 38);
  assert.equal(classes.get('sinclair-font'), false, 'Non-retro text uses the normal font');
  assert.equal(classes.get('plot-graphics'), false);
  assert.equal(graphics.screenElements[0].textContent, 'A');
  const source = 'LD A,42\nHALT ; £';
  const url = new URL('https://example.test/simulator.html?other=value');
  url.searchParams.set('asm', btoa(encodeURIComponent(source)));
  const saved = fixture(url.href);
  assert.equal(saved.sim.loadFromURL(), true);
  assert.equal(saved.sim.getAssemblyCode(), source);
  assert.equal(saved.windowStub.location.href, url.href, 'Loading does not rewrite a shared URL');
  const refreshed = fixture(saved.windowStub.location.href);
  assert.equal(refreshed.sim.loadFromURL(), true, 'A refresh can load the same saved program');
  assert.equal(refreshed.sim.getAssemblyCode(), source);
  refreshed.sim.clearAssembly();
  assert.equal(refreshed.windowStub.location.searchParams.has('asm'), false, 'Explicit Clear still removes saved code');
  assert.equal(refreshed.windowStub.location.searchParams.get('other'), 'value');
  const disabled = fixture('https://example.test/simulator.html?asm=dont');
  disabled.sim.clearAssembly();
  assert.equal(disabled.sim.loadFromURL(), false);
  assert.equal(disabled.windowStub.location.searchParams.get('asm'), 'dont');

  const gameUrl = 'https://example.test/simulator.html?sample=claudasaur&other=value';
  const game = fixture(gameUrl);
  game.initialize();
  assert.equal(game.sim.getAssemblyCode(), require('./claudasaur_asm.js').trimStart());
  assert.equal(game.sim.state, game.STATE.FREE_RUNNING, 'The game link starts CPU execution');
  assert.ok(game.sim.instructionCount > 0);
  assert.equal(game.sim.isBootSequenceRunning, false, 'Autostart ends the boot sequence');
  assert.equal(game.windowStub.location.href, gameUrl, 'The running game keeps its short link');
  assert.deepEqual(game.bugs, []);
  assert.equal(game.messages.some(message => message.includes('too large')), false);
  const gameRefresh = fixture(game.windowStub.location.href);
  gameRefresh.initialize();
  assert.equal(gameRefresh.sim.state, gameRefresh.STATE.FREE_RUNNING, 'Refresh restarts the game');
  gameRefresh.sim.clearAssembly();
  assert.equal(gameRefresh.windowStub.location.searchParams.has('sample'), false);
  assert.equal(gameRefresh.windowStub.location.searchParams.get('other'), 'value');

  const savedLoad = fixture(url.href);
  const chessUrl = 'https://example.test/simulator.html?sample=chess&other=value';
  const chess = fixture(chessUrl);
  chess.initialize();
  assert.equal(chess.sim.state, chess.STATE.FREE_RUNNING, 'The chess link starts the game');
  assert.equal(chess.windowStub.location.href, chessUrl, 'Chess keeps its short link');
  assert.deepEqual(gameKeys(chess), chosenKeys, 'Chess uses the same default controls as every program');
  assert.equal(chess.sim.cpu.executeSteps(chess.sim.memory,chess.sim.ioMap,10000).error,null);
  assert.equal(chess.sim.memory[0x2064],9,'Chess starts on the opening board without a Space press');
  assert.ok(chess.sim.memory.slice(60000,60768).some(value=>value!==0),'The opening board is visible without input');
  for(const key of 'E7E5') {
    chess.sim.pressKey(key,key);
    chess.sim.releaseKey(key);
  }
  assert.equal(chess.sim.ioMap[1],255, 'All four taps ended before the next CPU batch');
  assert.equal(chess.sim.cpu.executeSteps(chess.sim.memory,chess.sim.ioMap,2000000).error,null);
  assert.equal(chess.sim.memory[0x2064],0,'The queued move vacates E7');
  assert.equal(chess.sim.memory[0x2044],17,'After E7E5 the computer captures on E5 with its central pawn');
  assert.equal(chess.sim.memory[0x2033],0,'The reply vacates D4');
  assert.equal(chess.sim.memory[0x2080],8,'The computer replied and returned the turn to Black');
  chess.sim.pressKey('E','E');
  chess.sim.resetRequest();
  assert.equal(chess.sim.InPort(5),255,'Reset discards partial queued moves');
  assert.equal(chess.sim.cpu.executeSteps(chess.sim.memory,chess.sim.ioMap,10000).error,null);
  assert.equal(chess.sim.memory[0x2064],9,'Reset returns directly to the opening board');
  chess.sim.loadSample('characterSet');
  assert.deepEqual(gameKeys(chess), chosenKeys);
  const chessRefresh=fixture(chessUrl);
  chessRefresh.initialize();
  assert.equal(chessRefresh.sim.state,chessRefresh.STATE.FREE_RUNNING,'Chess starts after refresh');
  assert.deepEqual(chess.bugs,[]);
  savedLoad.initialize();
  assert.equal(savedLoad.sim.getAssemblyCode(), source);
  assert.equal(savedLoad.sim.cpu.registers.A, 42, 'Saved assembly starts automatically from its URL');
  assert.equal(savedLoad.sim.state, savedLoad.STATE.STEPPING, 'Saved assembly runs through HALT');
  const savedRefresh = fixture(savedLoad.windowStub.location.href);
  savedRefresh.initialize();
  assert.equal(savedRefresh.sim.cpu.registers.A, 42, 'Refreshing a saved URL executes the program again');
  const plain = fixture();
  plain.initialize();
  assert.equal(plain.sim.state, plain.STATE.NOT_READY, 'An ordinary visit still waits for Run');
  const gameDisabled = fixture(gameUrl + '&asm=dont');
  gameDisabled.initialize();
  assert.equal(gameDisabled.sim.state, gameDisabled.STATE.FREE_RUNNING);
  assert.equal(gameDisabled.windowStub.location.searchParams.get('asm'), 'dont');
  const customGameUrl = new URL(gameUrl);
  customGameUrl.searchParams.set('asm', btoa(encodeURIComponent(source)));
  const customGame = fixture(customGameUrl.href);
  customGame.initialize();
  assert.equal(customGame.sim.cpu.registers.A, 42, 'Saved assembly takes precedence over a named game');
  assert.equal(customGame.sim.state, customGame.STATE.STEPPING);
  assert.equal(customGame.windowStub.location.searchParams.has('sample'), false);

  game.sim.updateURL(game.sim.getAssemblyCode() + '\n; edited');
  assert.equal(game.windowStub.location.searchParams.has('sample'), false,
    'An oversized edited game cannot retain a link that reloads the unedited game');
  const unknownProgram = fixture('https://example.test/simulator.html?run=missing');
  assert.equal(unknownProgram.sim.loadFromURL(), false);
  assert.ok(unknownProgram.messages.some(message => message.includes('Unknown URL program')));
  unknownProgram.initialize();
  assert.equal(unknownProgram.sim.state, unknownProgram.STATE.NOT_READY,
    'An unknown program must not automatically start the default program');

  function blockedAutostart() {
    const firstNote = 'LD A,44\nOUT (2),A\nLD A,142\nOUT (3),A\nHALT';
    const autoplay = fixture('https://example.test/simulator.html?asm=' + encodeURIComponent(btoa(encodeURIComponent(firstNote))));
    autoplay.sim.initializeAudio();
    const blockedAudio = autoplay.sim.audioContext;
    blockedAudio.state = 'suspended';
    let activated = false;
    blockedAudio.resume = async () => {
      blockedAudio.calls.push('resume');
      if (activated) { blockedAudio.state = 'running'; blockedAudio.emit('statechange'); }
    };
    autoplay.allowAudio = () => { activated = true; };
    // Any program's first note must survive the gate, without game-specific code.
    autoplay.initialize();
    assert.equal(autoplay.sim.instructionCount, 0, 'CPU stays stopped before the first instruction');
    assert.equal(autoplay.sim.runLoopInterval, null);
    assert.equal(blockedAudio.notes, 0, 'Opening notes are not consumed while sound is blocked');
    assert.equal(autoplay.audioUI.audioStartPrompt.hidden, false);
    return autoplay;
  }

  for (const gesture of ['click', 'keydown']) {
    const autoplay = blockedAutostart();
    const blockedAudio = autoplay.sim.audioContext;
    autoplay.allowAudio();
    const input = { target: autoplay.audioUI.startWithSound, key: ' ', code: 'Space' };
    const event = autoplay.audioUI.audioStartPrompt.emit(gesture, input);
    await Promise.resolve();
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true, 'The startup interaction is consumed');
    assert.equal(blockedAudio.state, 'running', `${gesture} enables audio before execution`);
    assert.equal(autoplay.sim.audioContext, blockedAudio, 'Unlock reuses the existing audio context');
    assert.equal(blockedAudio.notes, 1, 'The program plays its first note after sound starts');
    assert.equal(autoplay.sim.state, autoplay.STATE.STEPPING, 'The test program reaches HALT');
    assert.equal(autoplay.audioUI.audioStartPrompt.hidden, true);
    const executed = autoplay.sim.instructionCount;
    blockedAudio.emit('statechange');
    assert.equal(autoplay.sim.instructionCount, executed, 'Audio state changes cannot start the program twice');
    if (gesture === 'keydown') {
      autoplay.documentStub.addEventListener('keydown', e => autoplay.sim.pressKey(e.code, e.key));
      autoplay.documentStub.emit('keydown', { ...input, repeat: true });
      assert.equal(autoplay.sim.ioMap[1], 255, 'Holding Space cannot enter the program after dismissing the prompt');
      autoplay.documentStub.emit('keyup', input);
      autoplay.documentStub.emit('keydown', input);
      assert.equal(autoplay.sim.ioMap[1], 0, 'A fresh Space press reaches the program');
    }
  }

  const muted = blockedAutostart();
  const tabKey = muted.audioUI.audioStartPrompt.emit('keydown', { key: 'Tab' });
  assert.equal(tabKey.defaultPrevented, false, 'Tab can move between the sound choices');
  assert.equal(tabKey.propagationStopped, true, 'The simulator keyboard cannot intercept Tab navigation');
  assert.equal(muted.sim.instructionCount, 0);
  muted.audioUI.audioStartPrompt.emit('click', { target: muted.audioUI.startMuted });
  assert.equal(muted.sim.state, muted.STATE.STEPPING, 'Start muted executes without audio permission');
  assert.equal(muted.sim.audioContext.notes, 0);
  muted.allowAudio();
  muted.documentStub.emit('click');
  muted.documentStub.hidden = true;
  muted.documentStub.emit('visibilitychange');
  muted.documentStub.hidden = false;
  muted.documentStub.emit('visibilitychange');
  muted.sim.playBeep(440, 100);
  assert.equal(muted.sim.audioContext.notes, 0, 'Muted choice survives input and tab visibility changes');
  const cancelled = blockedAutostart();
  cancelled.sim.clearAssembly();
  cancelled.allowAudio();
  await cancelled.sim.audioContext.resume();
  assert.equal(cancelled.sim.instructionCount, 0, 'Clear cancels a pending launch');
  assert.equal(cancelled.audioUI.audioStartPrompt.hidden, true);
  const rejected = blockedAutostart();
  rejected.sim.audioContext.resume = async () => { throw new Error('permission denied'); };
  rejected.audioUI.audioStartPrompt.emit('click', { target: rejected.audioUI.startWithSound });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(rejected.audioUI.audioStartMessage.textContent, /Try again or start muted/);
  assert.equal(rejected.sim.instructionCount, 0, 'Failed permission leaves the CPU stopped');
  rejected.audioUI.audioStartPrompt.emit('click', { target: rejected.audioUI.startMuted });
  assert.equal(rejected.sim.state, rejected.STATE.STEPPING);
  const delayedPermission = blockedAutostart();
  delayedPermission.allowAudio();
  await delayedPermission.sim.audioContext.resume();
  assert.equal(delayedPermission.audioUI.audioStartPrompt.hidden, true,
    'An allowed but asynchronous audio start dismisses the prompt automatically');

  const f = fixture();
  const { sim, STATE } = f;
  sim.stageConfig = [
    { run() {}, duration: 1000 },
    { run() { sim.memory[60000] = 0; }, duration: -1 },
  ];
  sim.isBootSequenceRunning = true;
  sim.startStage(0);
  const bootId = sim.currentStageTimer;
  const staleBootCallback = f.timers.get(bootId).callback;
  sim.setAssemblyCode('ORG 0\nHALT\nORG 60000\nDB "HELLO"');
  sim.assembleAndRun();
  assert.equal(ZX81.decode(sim.memory.slice(60000, 60005)), 'HELLO', 'Explicit screen data survives assembly');
  assert.equal(sim.memory[60005], 0, 'Uninitialized screen cells are still cleared');
  assert.equal(sim.state, STATE.STEPPING);
  assert.equal(sim.isBootSequenceRunning, false);
  assert.equal(sim.currentStageTimer, null);
  assert.equal(f.timers.has(bootId), false, 'Starting a program cancels pending boot work');
  staleBootCallback();
  assert.equal(sim.memory[60000], 45, 'Even an already queued boot callback cannot overwrite a program');

  const audio = sim.audioContext;
  f.documentStub.hidden = true;
  f.documentStub.emit('visibilitychange');
  await Promise.resolve();
  assert.equal(audio.state, 'suspended');
  sim.playBeep(440, 100);
  assert.equal(audio.notes, 0, 'Hidden tabs do not accumulate pending notes');
  f.documentStub.hidden = false;
  f.documentStub.emit('visibilitychange');
  await Promise.resolve();
  assert.equal(sim.audioContext, audio, 'Returning uses the same live audio context');
  assert.equal(audio.state, 'running');
  sim.playBeep(440, 100);
  assert.equal(audio.notes, 1, 'Audio can play again without reassembling');
  const originalSuspend = audio.suspend;
  let finishSuspend;
  audio.suspend = () => { audio.calls.push('suspend'); return new Promise(resolve => { finishSuspend = resolve; }); };
  f.documentStub.hidden = true;
  f.documentStub.emit('visibilitychange');
  f.documentStub.hidden = false;
  f.documentStub.emit('visibilitychange');
  assert.equal(audio.calls.at(-1), 'resume', 'A quick return requests resume even while suspend is pending');
  finishSuspend();
  audio.suspend = originalSuspend;
  await sim.cleanupAudio();
  assert.equal(audio.state, 'closed');
  assert.equal(sim.audioContext, null);
  sim.initializeAudio();
  assert.notEqual(sim.audioContext, audio, 'Audio can be initialized after explicit cleanup');
  sim.audioContext.state = 'closed';
  sim.initializeAudio();
  assert.equal(sim.audioContext.state, 'running', 'A closed context is replaced during initialization');
  sim.audioContext.resume = async () => { throw new Error('test rejection'); };
  await sim.updateAudioState();
  assert.ok(f.messages.some(message => message.includes('test rejection')), 'Audio promise failures are reported');
  assert.equal(f.bugs.length, 0);

  const runtime = fixture();
  runtime.sim.setAssemblyCode('DB 221');
  runtime.sim.assembleAndRun();
  assert.equal(runtime.sim.state, runtime.STATE.STEPPING, 'A CPU fault exits running mode');
  assert.equal(runtime.sim.cpu.PC, 0, 'PC stays on the failing opcode');
  assert.equal(runtime.sim.displayedPC, 0, 'The failing address is exposed to the hardware display');
  assert.match(runtime.controls.innerHTML, />Step<\/button>/, 'The Step control replaces Break');
  assert.equal(runtime.sim.runLoopInterval, null);
  assert.equal(runtime.bugs.length, 1);
  runtime.sim.resetRequest();
  runtime.sim.memory[0] = 0x76;
  runtime.sim.runRequest();
  assert.equal(runtime.sim.cpu.PC, 1, 'Reset and Run execute again after correcting the fault');
  for (const bytes of [[0xcb, 0x30], [0xed, 0]]) {
    runtime.sim.memory.set(bytes);
    runtime.sim.cpu.set(0);
    const result = runtime.sim.cpu.executeSteps(runtime.sim.memory, runtime.sim.ioMap, 1);
    assert.ok(result.error);
    assert.equal(runtime.sim.cpu.PC, 0, 'Prefixed faults also preserve their starting address');
  }

  const timers = fixture();
  for (let i = 0; i < 10000; i++) {
    const id = timers.sim.createTimer(() => {}, 1, false);
    timers.fire(id);
  }
  assert.equal(timers.sim.activeTimers.size, 0, 'Completed timeouts are not retained');
  const interval = timers.sim.createTimer(() => {}, 1, true);
  timers.fire(interval);
  assert.equal(timers.sim.activeTimers.has(interval), true, 'Repeating timers remain tracked');
  timers.sim.clearTimer(interval);
  assert.equal(timers.sim.activeTimers.size, 0);
  const throwing = timers.sim.createTimer(() => { throw new Error('callback failure'); }, 1, false);
  assert.throws(() => timers.fire(throwing), /callback failure/);
  assert.equal(timers.sim.activeTimers.size, 0, 'Throwing callbacks are retired too');

  const budget = fixture();
  budget.sim.setAssemblyCode('ORG 0\nLD BC,0\nLD HL,0\nLD DE,0\nloop: LDIR\nJP loop');
  budget.sim.assembleAndRun();
  assert.equal(budget.sim.state, budget.STATE.FREE_RUNNING);
  assert.ok(budget.sim.instructionCount > 0 && budget.sim.instructionCount < 15991,
    'An expensive program yields within its first CPU batch');
  for (let i = 0; i < 20; i++) budget.fire(budget.sim.runLoopInterval);
  assert.equal(budget.sim.activeTimers.size, 1, 'Only the next run callback remains active');
  budget.sim.breakRequest();
  assert.equal(budget.sim.activeTimers.size, 0);
  const executedBefore = budget.sim.instructionCount;
  budget.sim.runRequest();
  assert.ok(budget.sim.instructionCount > executedBefore, 'Run resumes after yielding and breaking');
  budget.sim.breakRequest();
  const unbudgeted = budget.sim.cpu.executeSteps(new Uint8Array(65536), new Uint8Array(256), 500);
  assert.equal(unbudgeted.instructionsExecuted, 500, 'Unbudgeted callers retain exact instruction counts');

  const invalid = fixture();
  invalid.sim.memory[0] = 42;
  invalid.sim.setAssemblyCode('ORG 65536\nLD A,42');
  invalid.sim.assembleAndRun();
  assert.equal(invalid.sim.state, invalid.STATE.NOT_READY);
  assert.equal(invalid.sim.memory[0], 42, 'Rejected assembly leaves existing RAM intact');
  assert.equal(invalid.sim.listing.isError, true);
  assert.match(invalid.sim.listing.text, /ORG address out of range/);
  assert.equal(invalid.sim.runLoopInterval, null);
  console.log('Simulator passed: shared URLs, URL autostart and refresh, screen data, boot cancellation, audio lifecycle, CPU faults, timer cleanup, execution deadlines, and assembly rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
