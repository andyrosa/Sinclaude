const assert = require('node:assert/strict');
const durationClose = (actual, expected) => assert.ok(Math.abs(actual / expected - 1) < 0.017,
  `Duration ${actual}ms should be within 1.7% of ${expected}ms`);
require('./node_test_globals.js');
const assembler = new Z80Assembler();
const result = assembler.assemble(require('./claudasaur_asm.js'));
assert.equal(result.success, true, JSON.stringify(result.errors));
const symbols = assembler.symbols;
const invaderAssembler = new Z80Assembler();
const invaderResult = invaderAssembler.assemble(SPACE_INVADER_ASM);
assert.equal(invaderResult.success, true, JSON.stringify(invaderResult.errors));
durationClose(decodeBeepDuration(invaderAssembler.symbols.MISSILE_BEEP_DURATION), 2);
durationClose(decodeBeepDuration(invaderAssembler.symbols.BOMB_BEEP_DURATION), 4);
const memory = new Uint8Array(65536);
for (const line of result.instructionDetails) {
  if (line.opcodes.length) memory.set(line.opcodes, line.startAddress);
}
const ports = new Uint8Array(256);
ports[1] = 255;
const cpu = new Z80CPU();
const sounds = [];
let gameTick = 0;
function assertSounds(expected, message) {
  assert.deepEqual(sounds.map(n => [n.tick, n.hz]), expected.map(n => n.slice(0, 2)), message);
  expected.forEach((note, i) => durationClose(sounds[i].ms, note[2]));
}
const address = name => {
  const value = symbols[name.toUpperCase()];
  assert.equal(typeof value, 'number', `Missing symbol ${name}`);
  return value;
};
const get = name => memory[address(name)];
const set = (name, value) => { memory[address(name)] = value; };
function run() {
  // Sample and clear beep requests at the same CPU batch boundaries as the
  // simulator. This catches sequences that overwrite notes before the host
  // can hear them, without needing an audio device in the Node tests.
  for (let budget = 100000; budget > 0; budget -= RUN_BATCH_INSTRUCTIONS) {
    const result = cpu.executeSteps(memory, ports, Math.min(budget, RUN_BATCH_INSTRUCTIONS));
    assert.equal(result.error, null);
    if (ports[2] > 0 && ports[3] > 0) {
      sounds.push({ tick: gameTick, hz: ports[2] * 10, ms: decodeBeepDuration(ports[3]), volume: ports[4] });
      ports[2] = 0;
      ports[3] = 0;
    }
    if (result.halted) break;
  }
}
function tick(key = 255) {
  gameTick++;
  ports[0] = 6;
  ports[1] = typeof key === 'string' ? key.charCodeAt(0) : key;
  run();
}
function press(key) { tick(); tick(key); }
function call(name) {
  cpu.SP = 65532;
  memory[65532] = 254;
  memory[65533] = 255;
  memory[65534] = 118;
  cpu.PC = address(name);
  run();
  assert.equal(cpu.halted, true, `${name} must return`);
}
run();
assert.equal(get('state'), 0);
const titleScreen = memory.slice(60000, 60768);
assert.equal(sounds.length, 0, 'Drawing the title does not start music');
ticks(2);
assert.equal(sounds.length, 0, 'Title remains silent for the first 200ms');
tick();
assertSounds([[3, 260, 120]], 'Music begins 300ms after drawing the title');
assert.equal(sounds[0].volume, 54);
ticks(109);
assert.equal(get('state'), 0);
assert.deepEqual(memory.slice(60000, 60768), titleScreen, 'Music preserves the title screen');
assert.equal(sounds.length, 45, '5.4-second broom theme repeats twice without dropping notes');
assert.deepEqual(sounds.slice(22, 44).map(n => ({ ...n, tick: n.tick - 54 })), sounds.slice(0, 22),
  'Each loop repeats the complete pattern with the same rhythm');
assert.equal(sounds[44].tick, 111);
assert.deepEqual(sounds.slice(0, 10).map(n => n.hz),
  [260, 290, 330, 350, 420, 350, 420, 390, 350, 330],
  'Broom theme preserves the C-D-E pickup, repeated F-Ab, and G-F-E reply');
assert.ok(sounds.every(n => n.volume > 0 && n.volume <= 85), 'Music never exceeds one-third of the former gain');
assert.ok(sounds[3].volume > sounds[0].volume, 'Downbeat accents stand above the pickup');
assert.deepEqual(sounds.slice(0, 10).map(n => n.tick), [3, 5, 7, 9, 13, 15, 19, 21, 23, 25],
  'The 3/8 march preserves eighth-note rests between F and Ab');
sounds.slice(0, -1).forEach((note, i) => {
  assert.ok(note.ms >= 115 && note.ms <= 155, 'The broom theme uses short staccato gates');
  assert.ok(note.ms < (sounds[i + 1].tick - note.tick) * 100,
    'Quantized notes leave audible silence before the next note');
});
// Start exactly when the next title note is due: input must win over music.
tick(' ');
assert.equal(get('state'), 1);
assert.equal(get('player'), 17);
ticks(12);
assert.equal(sounds.length, 45, 'Starting cancels pending title notes');
press('W');
assert.equal(get('player'), 18);
press('A');
assert.equal(get('direction'), 0);
press('W');
assert.equal(get('player'), 18, 'Walls block movement');
press('P');
const beforePause = get('countdown');
press('W');
assert.equal(get('countdown'), beforePause, 'Pause freezes pursuit');
press('P');
press(' ');
assert.equal(get('map_on'), 1);
assert.equal(memory[60000 + 104 + 2 * 1 * 16 + 2], 64, 'Map shows player');
press(' ');
assert.equal(get('map_on'), 0);

// Verify the supplied maze is connected and pursuit decreases actual shortest
// path distance, including around corners where greedy movement would stall.
const mazeBase = address('maze');
function distances(start) {
  const dist = new Map([[start, 0]]), queue = [start];
  for (const cell of queue) {
    for (const next of [cell - 16, cell + 1, cell + 16, cell - 1]) {
      if (memory[mazeBase + next] !== 1 && !dist.has(next)) {
        assert.ok(next >= 0 && next < 256, 'Maze must have a sealed border');
        dist.set(next, dist.get(cell) + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}
const paths = distances(17);
assert.equal(paths.size, memory.slice(mazeBase, mazeBase + 256).filter(n => n !== 1).length);
assert.ok(paths.has(30), 'Exit is reachable');
for (const target of [17, 30, 85, 153, 225]) {
  const dist = distances(target);
  for (const source of [17, 30, 85, 153, 225]) {
    set('player', target);
    set('monster', source);
    call('hunt');
    assert.equal(dist.get(get('monster')), Math.max(0, dist.get(source) - 1));
    assert.equal(get('distance'), dist.get(get('monster')));
  }
}

// Exercise loss/retry and the exit through the normal input/frame loop.
cpu.PC = address('wait_key');
cpu.SP = 65535;
set('player', 17);
set('monster', 18);
set('direction', 1);
set('countdown', 60);
tick();
press('W');
assert.equal(get('state'), 3, 'Entering the monster cell loses');
press(' ');
assert.equal(get('state'), 1);
assert.equal(get('player'), 17);
set('player', 29);
set('direction', 1);
press('W');
assert.equal(get('state'), 2, 'Entering the exit wins');
press(' ');
assert.equal(get('state'), 1);
assert.equal(get('paused'), 0);
assert.equal(get('map_on'), 0);

// Every reachable viewpoint must render inside the 32x24 back buffer.
// This also executes every perspective table for both corridor orientations.
for (const cell of paths.keys()) {
  for (let facing = 0; facing < 4; facing++) {
    set('player', cell);
    set('direction', facing);
    memory[address('buffer') - 1] = 91;
    memory[address('buffer') + 768] = 92;
    call('render');
    assert.equal(memory[address('buffer') - 1], 91);
    assert.equal(memory[address('buffer') + 768], 92);
    assert.equal(memory[60000 + 712], 'NESW'.charCodeAt(facing));
  }
}

function prepareSoundTest(distance) {
  call('sound_reset');
  set('state', 1);
  set('paused', 0);
  set('map_on', 0);
  set('player', 17);
  set('monster', 225);
  set('direction', 1);
  set('last_key', 255);
  set('distance', distance);
  // Hold pursuit beyond the test window so each distance band can be heard
  // for a whole cycle without the monster changing bands or catching us.
  set('countdown', 240);
  cpu.SP = 65535;
  cpu.PC = address('wait_key');
  run();
  gameTick = 0;
  sounds.length = 0;
}
function ticks(count) { for (let i = 0; i < count; i++) tick(); }
for (const distance of [7, 12, 255]) {
  prepareSoundTest(distance);
  ticks(24);
  assert.equal(sounds.length, 0, 'Far away and waking monsters are silent');
}
for (const distance of [4, 6]) {
  prepareSoundTest(distance);
  ticks(24);
  assertSounds([
    [1, 160, 55], [3, 120, 65], [13, 160, 55], [15, 120, 65],
  ], 'Nearby heartbeat repeats every 1.2s with a 0.2s double beat');
}
for (const distance of [1, 3]) {
  prepareSoundTest(distance);
  ticks(12);
  assert.deepEqual(sounds.map(n => [n.tick, n.hz]), [
    [1, 160], [3, 120], [7, 160], [9, 120],
  ], 'Danger heartbeat is twice as fast');
  assert.deepEqual(sounds.map(n => n.volume), [75, 50, 75, 50], 'Second heartbeat is softer');
}
prepareSoundTest(3);
tick();
tick('P');
ticks(12);
assert.equal(sounds.length, 1, 'Pause cancels the pending second heartbeat');
tick('P');
assert.equal(sounds.length, 2, 'Unpause starts a fresh heartbeat');
set('distance', 7);
ticks(12);
assert.equal(sounds.length, 2, 'Leaving audible range cancels heartbeat');

prepareSoundTest(6);
tick(' ');
tick();
tick('W');
assert.equal(get('map_on'), 1);
assert.equal(get('player'), 18, 'Walking remains responsive during heartbeat');
assert.deepEqual(sounds.map(n => n.hz), [160, 120], 'Map keeps proximity audio active');

for (const outcome of ['capture', 'escape']) {
  prepareSoundTest(255);
  if (outcome === 'capture') set('monster', 18);
  else set('player', 29);
  tick('W');
  assert.equal(get('state'), outcome === 'capture' ? 3 : 2);
  ticks(20);
  const expected = outcome === 'capture'
    ? [[1, 640, 80], [3, 420, 90], [5, 260, 100], [7, 120, 240]]
    : [[1, 520, 100], [3, 660, 100], [5, 780, 240]];
  assertSounds(expected,
    `${outcome} plays once, with each note delivered to the host`);
  assert.deepEqual(sounds.map(n => n.volume), outcome === 'capture' ? [85, 75, 65, 55] : [55, 65, 85],
    'Capture fades down and the escape chime swells within the reduced level');
}
prepareSoundTest(3);
set('monster', 18);
tick('W');
tick(' ');
assert.equal(get('state'), 1, 'Retry does not wait for the capture melody');
ticks(15);
assert.deepEqual(sounds.map(n => n.hz), [640], 'Retry discards pending notes and stale proximity');

sounds.length = 0;
cpu.PC = address('title');
run();
tick();
tick(' ');
assert.equal(get('state'), 1, 'Space starts play during the title music delay');
ticks(12);
assert.equal(sounds.length, 0, 'Starting early cancels the delayed title music');

console.log('Claudasaur passed: delayed title music, looping and immediate start, gameplay, all maze viewpoints, pursuit, heartbeat bands, pause, live-map audio, nonblocking movement/retry, and complete capture/escape sequences.');
