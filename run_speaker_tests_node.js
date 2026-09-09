const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { decodeBeepDuration, encodeBeepDuration } = require('./constants_and_css_vars.js');

// Exercise the real speaker methods without initializing the simulator UI.
const timers = [];
const context = vm.createContext({
  decodeBeepDuration,
  setTimeout: (callback, ms) => timers.push({ callback, ms }),
});
const Simulator = vm.runInContext(
  fs.readFileSync(require.resolve('./simulator.js'), 'utf8') + '\nSimulator;', context);
const simulator = Object.create(Simulator.prototype);
simulator.ioMap = new Uint8Array(256);
const oscillators = [], gains = [];
simulator.audioContext = {
  destination: {},
  createOscillator() {
    const node = {
      frequency: { value: 0 },
      connect(target) { this.target = target; },
      start() { this.started = true; },
      stop() { this.stopped = true; },
    };
    oscillators.push(node);
    return node;
  },
  createGain() {
    const node = { gain: { value: 0 }, connect(target) { this.target = target; } };
    gains.push(node);
    return node;
  },
};
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, message);
const audioContext = simulator.audioContext;
function requestBeep(volume) {
  if (volume !== undefined) simulator.OutPort(4, volume);
  simulator.OutPort(2, 44);
  simulator.OutPort(3, encodeBeepDuration(100));
  simulator.handleBeepPortChange();
  assert.equal(simulator.InPort(2), 0);
  assert.equal(simulator.InPort(3), 0);
}

simulator.resetBeepPorts();
assert.equal(simulator.InPort(4), 85);
requestBeep();
assert.equal(oscillators[0].frequency.value, 440);
assert.equal(oscillators[0].started, true);
assert.equal(oscillators[0].target, gains[0]);
assert.equal(gains[0].target, simulator.audioContext.destination);
close(gains[0].gain.value, 0.1 / 3);
assert.ok(Math.abs(timers[0].ms - 100) < 1.7, '100ms requests stay within 1.7% after encoding');
requestBeep(30);
close(gains[1].gain.value, 0.1 * 30 / 255);
requestBeep();
close(gains[2].gain.value, gains[1].gain.value);
assert.equal(simulator.InPort(4), 30, 'Volume persists across beep requests');
close(gains[0].gain.value, 0.1 / 3, 'Changing volume does not change an already playing note');
requestBeep(0);
assert.equal(oscillators.length, 3, 'Mute consumes requests without starting an oscillator');
assert.equal(simulator.InPort(4), 0, 'Mute persists');
requestBeep(255);
close(gains[3].gain.value, 0.1);
simulator.playBeep(880, 80);
close(gains[4].gain.value, 0.1 / 3, 'Two-argument calls also use the quieter default');
simulator.playBeep(880, 80, 45);
close(gains[5].gain.value, 0.1 * 45 / 255);
simulator.playBeep(880, 80, 0);
simulator.playBeep(880, 0, 85);
assert.equal(oscillators.length, 6);
timers.forEach(timer => timer.callback());
assert.ok(oscillators.every(node => node.stopped));

// Reset must recover from a muted previous program for older samples that
// only write the frequency and duration ports.
simulator.OutPort(4, 0);
simulator.cpu = { reset() {} };
simulator.updateHardwareDisplay = () => {};
simulator.clearNonEssentialTimers = () => {};
simulator.resetRequest();
requestBeep();
close(gains[6].gain.value, 0.1 / 3);
simulator.audioContext = null;
requestBeep();
assert.equal(oscillators.length, 7, 'Unavailable audio still consumes the request');
simulator.audioContext = audioContext;
simulator.OutPort(2, 44);
simulator.OutPort(3, 255);
simulator.handleBeepPortChange();
assert.equal(timers.at(-1).ms, 4000, 'The maximum code reaches the actual speaker timer without truncation');
timers.at(-1).callback();
assert.equal(oscillators.at(-1).stopped, true);

for (const [byte, milliseconds] of [[0, 0], [1, 1], [128, Math.sqrt(4000)], [255, 4000]]) {
  assert.equal(decodeBeepDuration(byte), milliseconds);
  assert.equal(encodeBeepDuration(milliseconds), byte);
}
const requests = [];
simulator.playBeep = (hz, ms, volume) => requests.push({ hz, ms, volume });
for (let byte = 0; byte <= 255; byte++) {
  const previousCount = requests.length;
  simulator.OutPort(2, 44);
  simulator.OutPort(3, byte);
  simulator.handleBeepPortChange();
  assert.equal(requests.length, previousCount + (byte === 0 ? 0 : 1));
  assert.equal(encodeBeepDuration(decodeBeepDuration(byte)), byte, 'All byte values round-trip');
  if (byte > 0) {
    close(requests.at(-1).ms, decodeBeepDuration(byte));
    assert.equal(simulator.InPort(2), 0);
    assert.equal(simulator.InPort(3), 0);
    assert.ok(decodeBeepDuration(byte) > decodeBeepDuration(byte - 1));
    if (byte > 1) close(decodeBeepDuration(byte) / decodeBeepDuration(byte - 1), 4000 ** (1 / 254),
      'Adjacent codes have constant proportional growth');
  }
}
for (const bad of [-1, 256, 1.5, NaN]) assert.throws(() => decodeBeepDuration(bad), RangeError);
for (const ms of [2, 4, 55, 65, 80, 90, 100, 180, 240, 580, 780, 1180, 2500]) {
  assert.ok(Math.abs(decodeBeepDuration(encodeBeepDuration(ms)) / ms - 1) < 0.017);
}
for (const bad of [-1, 0.5, 4001, Infinity, NaN]) assert.throws(() => encodeBeepDuration(bad), RangeError);
console.log('Speaker passed: exponential duration across all 256 codes, constant ratio, four-second maximum, long notes, volume, persistence, mute, reset, optional parameter, and oscillator lifetime.');
