const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real key mapping methods without initializing the simulator UI.
const context = vm.createContext({});
const Simulator = vm.runInContext(
  fs.readFileSync(require.resolve('./simulator.js'), 'utf8') + '\nSimulator;', context);
const simulator = Object.create(Simulator.prototype);
simulator.ioMap = new Uint8Array(256);
simulator.initializeCharacterMappings();
simulator.initializeKeyMappings();

const KEYBOARD_PORT = 1;
const NO_KEY = 255;
const SPACE = 32;
const RELEASE = -1;

// The keydown handler converts e.key with labelToKeyCodeOrNull and skips null.
// Keys with no character must return null so they never reach setKey.
for (const keyName of ['Shift', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Meta', 'F1', 'F12', 'Dead', 'Unidentified']) {
  assert.equal(simulator.labelToKeyCodeOrNull(keyName), null, `${keyName} must not press any key`);
}
assert.equal(simulator.labelToKeyCodeOrNull(' '), SPACE, 'e.key for Space is a single space');
assert.equal(simulator.labelToKeyCodeOrNull('w'), 'W'.charCodeAt(0), 'Lowercase letters map to uppercase');
assert.equal(simulator.labelToKeyCodeOrNull('W'), 'W'.charCodeAt(0));
assert.equal(simulator.labelToKeyCodeOrNull('+'), '+'.charCodeAt(0), 'Punctuation keeps its own code');
assert.equal(simulator.labelToKeyCodeOrNull('Escape'), 27);
assert.equal(simulator.labelToKeyCodeOrNull('ArrowUp'), 38);

// setKey writes the keyboard port. Codes with no Sinclair character read as no-key,
// never as Space (the display fallback), which used to toggle the Claudasaur map.
const portAfter = (keyCode) => {
  simulator.setKey(keyCode);
  return simulator.InPort(KEYBOARD_PORT);
};
for (const keyCode of [0, 16, 17, 18, 20]) {
  assert.equal(portAfter(keyCode), NO_KEY, `Code ${keyCode} has no character and must read as no-key`);
}
assert.equal(portAfter(SPACE), SPACE, 'Space');
assert.equal(portAfter('W'.charCodeAt(0)), 'W'.charCodeAt(0), 'W');
assert.equal(portAfter('A'.charCodeAt(0)), 'A'.charCodeAt(0), 'A');
assert.equal(portAfter('+'.charCodeAt(0)), '+'.charCodeAt(0), 'Punctuation button captions still work');
assert.equal(portAfter(27), 12, 'Escape maps to Sinclair 12');
assert.equal(portAfter(38), 145, 'ArrowUp');
assert.equal(portAfter(40), 147, 'ArrowDown');
assert.equal(portAfter(37), 144, 'ArrowLeft');
assert.equal(portAfter(39), 146, 'ArrowRight');
assert.equal(portAfter(13), 13, 'Enter');
assert.equal(portAfter(RELEASE), NO_KEY, 'Release');
assert.equal(simulator.keyCodeCurrentReleased, true);

// Display text conversion keeps its space fallback for unknown characters
assert.equal(simulator.unicodeToSinclair(String.fromCharCode(18)), SPACE, 'Display fallback');

console.log('Keyboard passed: modifier and function keys press nothing, mapped keys and punctuation unchanged, display fallback intact.');
