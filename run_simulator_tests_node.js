const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sources = ['constants_and_css_vars.js', 'z80_assembler.js', 'z80_cpu_emulator.js', 'character_set_asm.js', 'simulator.js']
  .map(file => fs.readFileSync(require.resolve('./' + file), 'utf8')).join('\n');

// Stub browser services and presentation only. Assembly, CPU execution, URL loading,
// state transitions, button rendering, audio lifecycle and timers are the real code.
function fixture(url = 'https://example.test/simulator.html') {
  function eventTarget() {
    const listeners = new Map();
    return {
      classList: { toggle() {}, add() {} },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      emit(type) { for (const callback of listeners.get(type) || []) callback(); },
    };
  }
  const controls = { innerHTML: '' };
  const section = { focus() {}, scrollIntoView() {} };
  const execution = { querySelector: () => null, appendChild() {} };
  const documentStub = Object.assign(eventTarget(), {
    hidden: false,
    body: eventTarget(),
    documentElement: { style: { setProperty() {} } },
    getElementById: () => controls,
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
      this.state = 'suspended';
      this.calls = [];
      this.notes = 0;
      contexts.push(this);
    }
    async suspend() { this.calls.push('suspend'); this.state = 'suspended'; }
    async resume() { this.calls.push('resume'); this.state = 'running'; }
    async close() { this.calls.push('close'); this.state = 'closed'; }
    createOscillator() {
      this.notes++;
      return { frequency: {}, connect() {}, start() {}, stop() {} };
    }
    createGain() { return { gain: {}, connect() {} }; }
  }
  const context = vm.createContext({
    window: windowStub, document: documentStub, URL, URLSearchParams, btoa, atob,
    AudioContext: AudioStub, performance: { now: () => ++now },
    setTimeout: (callback, ms) => schedule(callback, ms, false),
    setInterval: (callback, ms) => schedule(callback, ms, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    userMessage: message => messages.push(message),
    userMessageAboutBug: (message, detail) => bugs.push({ message, detail }),
  });
  const { Simulator, Z80CPU, STATE } = vm.runInContext(sources + '\n({Simulator, Z80CPU, STATE});', context);
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
  sim.setupCleanupHandlers();
  return {
    sim, STATE, timers, windowStub, documentStub, contexts, controls, messages, bugs,
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
  assert.equal(String.fromCharCode(...screen.slice(0, 32)).trim(), 'CHARACTER SET TEST');
  for (let code = 0; code < 256; code++) {
    const row = 2 + Math.floor(code / 16);
    const col = Math.floor(code % 16 / 4) * 8 + 3 + code % 4;
    assert.equal(screen[row * 32 + col], code, `Character ${code} is displayed unchanged`);
  }
  for (let row = 18; row < 24; row++) {
    const cells = screen.slice(row * 32, (row + 1) * 32);
    assert.equal(String.fromCharCode(...cells.slice(0, 5)), `ROW${row}`);
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
  const masks = new Map([[32,0],[6,5],[8,12],[9,4],[13,8],[14,2],[16,10],[17,6],[18,9],[19,14],[20,13],[21,3],[22,7]]);
  expectedPatterns.forEach((pattern, tile) => {
    for (let y = 0; y < 6; y++) {
      let actual = '';
      for (let x = 0; x < 6; x++) {
        const byte = screen[(18 + (y >> 1)) * 32 + 5 + tile * 3 + (x >> 1)];
        if (tile === 1) { assert.equal(byte, 7); continue; }
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
  graphics.useSinclairFont = true;
  for (const byte of [6, 7, 8, 9, 13, 14, 16, 17, 18, 19, 20, 21, 22, 32,
    134, 135, 136, 137, 141, 142, 144, 145, 146, 147, 148, 149, 150, 160]) {
    graphics.updateCharacterAt(0, byte);
    assert.equal(classes.get('sinclair-font'), false, 'Retro PLOT cells never receive font stretching');
    assert.equal(classes.get('plot-graphics'), true);
    assert.equal(graphics.screenElements[0].textContent, '', 'Graphics contain no antialiased font glyph');
    assert.ok(graphic.includes('<rect width="8" height="8"'));
    assert.equal(classes.get('inverted'), byte >= 128);
  }
  assert.ok(graphic.includes('d=""'), 'Inverse space fills the whole cell by inverting blank paper');
  graphics.updateCharacterAt(0, 147);
  assert.deepEqual([...graphic.matchAll(/M(\d+) (\d+)h4v4h-4z/g)].map(([, x, y]) => [Number(x), Number(y)]),
    [[4, 0], [0, 4], [4, 4]],
    'Inverse lower-right three-quarter block leaves only the top-left quadrant black');
  const writesBeforeInversion = graphicWrites;
  graphics.updateCharacterAt(0, 19);
  assert.equal(graphicWrites, writesBeforeInversion, 'Inverting a graphic reuses its SVG');
  graphics.updateCharacterAt(0, 7);
  const dots = [...graphic.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.equal(dots.length, 32);
  assert.ok(dots.every(([x, y]) => (x + y) % 2 === 0), 'Stipple is an alternating 8 by 8 bitmap');
  assert.equal(graphics.sinclairToUnicode(7), '\u2592', 'Stippled wall faces use the shade character');
  graphics.updateCharacterAt(0, 65);
  assert.equal(classes.get('sinclair-font'), true, 'Text retains the Sinclair font');
  assert.equal(classes.get('plot-graphics'), false);
  assert.equal(graphics.screenElements[0].plotCode, undefined, 'Writing text clears the graphics cache');
  assert.equal(graphics.screenElements[0].textContent, 'A');
  graphics.updateCharacterAt(0, 7);
  graphics.useSinclairFont = false;
  graphics.updateCharacterAt(0, 7);
  assert.equal(classes.get('plot-graphics'), false, 'Font-off rendering remains unchanged');
  assert.equal(graphics.screenElements[0].plotCode, undefined);
  assert.equal(graphics.screenElements[0].textContent, '\u2592');
  const source = 'LD A,42\nHALT ; £';
  const url = new URL('https://example.test/simulator.html?assemble=1&other=value');
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
  assert.equal(String.fromCharCode(...sim.memory.slice(60000, 60005)), 'HELLO', 'Explicit screen data survives assembly');
  assert.equal(sim.memory[60005], 32, 'Uninitialized screen cells are still cleared');
  assert.equal(sim.state, STATE.STEPPING);
  assert.equal(sim.isBootSequenceRunning, false);
  assert.equal(sim.currentStageTimer, null);
  assert.equal(f.timers.has(bootId), false, 'Starting a program cancels pending boot work');
  staleBootCallback();
  assert.equal(sim.memory[60000], 72, 'Even an already queued boot callback cannot overwrite a program');

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
  console.log('Simulator passed: shared URLs, screen data, boot cancellation, audio lifecycle, CPU faults, timer cleanup, execution deadlines, and assembly rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
