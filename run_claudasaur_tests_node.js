const assert = require('node:assert/strict');
require('./node_test_globals.js');
const assembler = new Z80Assembler();
const result = assembler.assemble(require('./claudasaur_asm.js'));
assert.equal(result.success, true, JSON.stringify(result.errors));
const symbols = assembler.symbols;
const memory = new Uint8Array(65536);
for (const line of result.instructionDetails) {
  if (line.opcodes.length) memory.set(line.opcodes, line.startAddress);
}
const ports = new Uint8Array(256);
ports[1] = 255;
const cpu = new Z80CPU();
const address = name => {
  const value = symbols[name.toUpperCase()];
  assert.equal(typeof value, 'number', `Missing symbol ${name}`);
  return value;
};
const get = name => memory[address(name)];
const set = (name, value) => { memory[address(name)] = value; };
function run() {
  const result = cpu.executeSteps(memory, ports, 100000);
  assert.equal(result.error, null);
}
function tick(key = 255) {
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
press(' ');
assert.equal(get('state'), 1);
assert.equal(get('player'), 17);
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
console.log('Claudasaur passed: assembly, input, walls, pause, map, connected maze, 25 pursuit routes, capture, escape and retry.');
