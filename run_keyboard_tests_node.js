const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function eventTarget() {
  const listeners = new Map();
  return {
    classList: { toggle() {} },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    emit(type, data = {}) {
      const event = { target: { tagName: 'DIV' }, preventDefault() {}, ...data };
      for (const handler of listeners.get(type) || []) handler(event);
    },
  };
}
const section = eventTarget();
const touchKeyboard = Object.assign(eventTarget(), { value: '', tagName: 'TEXTAREA' });
section.contains = target => target === section || target === touchKeyboard;
const buttons = [];
const gameButtons = { classList: { toggle() {} }, appendChild: button => buttons.push(button) };
const documentStub = Object.assign(eventTarget(), {
  querySelector: () => section,
  getElementById: id => id === 'gameButtons' ? gameButtons : id === 'touchKeyboard' ? touchKeyboard : eventTarget(),
  createElement: () => Object.assign(eventTarget(), { setPointerCapture(id) { this.capturedPointer = id; } }),
});
const windowStub = eventTarget();
const timers = new Map();
let timerId = 0;
const context = vm.createContext({
  ZX81: require('./zx81_charset.js'),
  document: documentStub, window: windowStub,
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
});
const Simulator = vm.runInContext(
  fs.readFileSync(require.resolve('./simulator.js'), 'utf8') + '\nSimulator;', context);
const simulator = Object.create(Simulator.prototype);
simulator.ioMap = new Uint8Array(256);
simulator.activeTimers = new Set();
simulator.initializeCharacterMappings();
simulator.initializeKeyMappings();
simulator.initializePreferences();
simulator.setupKeyboard();
simulator.createGameButtons();
const port = () => simulator.InPort(1);
const key = (type, name, code = name, extra = {}) =>
  documentStub.emit(type, { key: name, code, ...extra });
section.emit('mouseenter');
assert.equal(port(), 255, 'No key is held on initialization');
assert.equal(simulator.InPort(5), 255, 'The discrete keystroke port starts empty');
key('keydown', '7', 'Digit7');
key('keydown', '7', 'Digit7', { repeat: true });
key('keyup', '7', 'Digit7');
key('keydown', 'e', 'KeyE');
key('keyup', 'e', 'KeyE');
assert.equal(port(), 255, 'Fast taps can already be released before CPU input');
assert.deepEqual([simulator.InPort(5), simulator.InPort(5), simulator.InPort(5)], [35,42,255],
  'Queued presses retain order, consume once, and ignore held-key repeat');
key('keydown', '5', 'Digit5');
simulator.releaseAllKeys();
assert.equal(simulator.InPort(5), 255, 'Capture cleanup also clears queued input');

for (const [name, expected] of [
  [' ', 0], ['w', 60], ['W', 60], ['+', 21], ['$', 13], [':', 14], ['?', 15], ['(', 16],
  ['Escape', 227], ['ArrowLeft', 114], ['ArrowUp', 112], ['ArrowRight', 115], ['ArrowDown', 113], ['Enter', 118], ['Backspace', 119],
]) {
  key('keydown', name);
  assert.equal(port(), expected, 'Physical ' + name + ' maps directly to its Sinclair code');
  key('keyup', name);
  assert.equal(port(), 255);
  simulator.buttonClick({ textContent: name === ' ' ? 'Space' : name }, 'button');
  assert.equal(port(), expected, 'Button caption ' + name + ' matches physical input');
  simulator.releaseKey('button');
}

key('keydown', 'w', 'KeyW');
for (const name of ['Shift', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Meta', 'F1', 'F12', 'Dead', 'Unidentified', 'Tab', '%', '&', "'", '!', '[', ']', '_', '^', '|', 'é']) {
  key('keydown', name);
  assert.equal(port(), 60, name + ' does not replace held W');
  key('keyup', name);
  assert.equal(port(), 60, name + ' release does not release W');
}
key('keydown', 'a', 'KeyA');
assert.equal(port(), 38, 'Most recently pressed key wins');
key('keydown', 'w', 'KeyW', { repeat: true });
assert.equal(port(), 38, 'Repeats do not reorder held keys');
key('keyup', 'a', 'KeyA');
assert.equal(port(), 60, 'Releasing A restores held W');
key('keydown', 'a', 'KeyA');
key('keyup', 'w', 'KeyW');
assert.equal(port(), 38, 'Releasing an older key preserves the current key');
key('keyup', 'a', 'KeyA');
key('keydown', '(', 'Digit9');
key('keyup', '9', 'Digit9');
assert.equal(port(), 255, 'Releasing Shift first does not strand shifted punctuation');

key('keydown', 'w', 'KeyW');
buttons[2].emit('pointerdown', { pointerId: 3 });
assert.equal(port(), 0);
assert.equal(buttons[2].capturedPointer, 3, 'Pointer release remains routed to the button after dragging away');
buttons[2].emit('pointercancel', { pointerId: 3 });
assert.equal(port(), 60, 'Cancelling a pointer preserves the held keyboard key');
buttons[0].emit('pointerdown', { pointerId: 4 });
buttons[1].emit('pointerdown', { pointerId: 5 });
buttons[0].emit('pointerup', { pointerId: 4 });
assert.equal(port(), 56, 'One pointer release does not release another');
buttons[1].emit('lostpointercapture', { pointerId: 5 });
assert.equal(port(), 60);

for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'BUTTON' }, { tagName: 'SUMMARY' }, { tagName: 'SPAN', isContentEditable: true }]) {
  key('keydown', 'a', 'KeyA', { target });
  assert.equal(port(), 60, 'Editing does not press emulator keys');
}
key('keyup', 'w', 'KeyW', { target: { tagName: 'INPUT' } });
assert.equal(port(), 255, 'A key released after focus moves to an input is still released');
for (const release of [
  () => section.emit('mouseleave'),
  () => windowStub.emit('blur'),
  () => { documentStub.hidden = true; documentStub.emit('visibilitychange'); },
]) {
  section.emit('mouseenter');
  key('keydown', 'w', 'KeyW');
  release();
  assert.equal(port(), 255, 'Leaving capture releases all keys');
  assert.equal(simulator.heldKeys.size, 0);
}
simulator.releaseAllKeys();
buttons[0].emit('keydown', { key: 'Enter' });
assert.equal(port(), 60, 'Keyboard activation presses the focused on-screen key');
buttons[0].emit('keydown', { key: 'Enter', repeat: true });
assert.equal(simulator.keyQueue.length, 1, 'Holding a focused button queues only one press');
buttons[0].emit('keyup', { key: 'Enter' });
assert.equal(port(), 255);
buttons[1].emit('keydown', { key: ' ' });
buttons[1].emit('blur');
assert.equal(port(), 255, 'Moving focus releases an on-screen key');

documentStub.hidden = false;
documentStub.emit('visibilitychange');
key('keydown', 'w', 'KeyW');
assert.equal(port(), 60, 'Returning to the tab preserves capture but not stale held keys');
key('keyup', 'w', 'KeyW');
assert.throws(() => simulator.unicodeToSinclair(String.fromCharCode(18)), /not in the ZX81 character set/);
simulator.releaseAllKeys();
const drain = () => {
  const codes = [];
  for (let code; (code = simulator.InPort(5)) !== 255;) codes.push(code);
  return codes;
};
const typeText = (text, data = {}) => {
  touchKeyboard.value = text;
  touchKeyboard.emit('input', { target: touchKeyboard, inputType: 'insertText', ...data });
};
const releaseTaps = () => {
  for (const [id, callback] of timers) { timers.delete(id); callback(); }
};
section.emit('focusin', { target: touchKeyboard });
key('keydown', 'Unidentified', '', { target: touchKeyboard, keyCode: 229 });
typeText('7e5e');
assert.deepEqual(drain(), [35, 42, 33, 42], 'Phone text produces one ordered press per character without usable keydown');
assert.equal(touchKeyboard.value, '', 'Sent text does not accumulate or get resent');
assert.equal(port(), 42, 'A touch tap is briefly visible to held-key polling');
releaseTaps();
assert.equal(port(), 255, 'Touch taps release without a keyboard keyup');
typeText('11 +\n');
assert.deepEqual(drain(), [29, 29, 0, 21, 118], 'Repeated letters, spaces, punctuation and Enter survive text input');
releaseTaps();
touchKeyboard.emit('compositionstart');
typeText('e', { isComposing: true });
typeText('E', { isComposing: true });
assert.deepEqual(drain(), [], 'IME previews do not become program input');
touchKeyboard.emit('compositionend', { data: 'E' });
touchKeyboard.emit('input', { data: 'E', inputType: 'insertText' });
assert.deepEqual(drain(), [42], 'The committed composition is sent exactly once');
releaseTaps();
touchKeyboard.emit('compositionstart');
typeText('a', { isComposing: true });
touchKeyboard.emit('compositionend', { data: '' });
assert.deepEqual(drain(), [], 'Cancelled composition does not press a key');
typeText('\u00e9');
assert.deepEqual(drain(), [], 'Unsupported text is not converted into another key');
assert.equal(timers.size, 0, 'Unsupported text does not schedule a release');
key('keydown', 'w', 'KeyW');
assert.deepEqual(drain(), [60]);
typeText('a');
assert.equal(port(), 38);
releaseTaps();
assert.equal(port(), 60, 'Releasing typed input restores a physical key still held');
key('keyup', 'w', 'KeyW');
drain();
documentStub.activeElement = touchKeyboard;
section.emit('mouseleave');
typeText('2');
assert.deepEqual(drain(), [30], 'The focused mobile field keeps capture when the pointer leaves');
section.emit('focusout', { relatedTarget: touchKeyboard });
typeText('3');
assert.deepEqual(drain(), [31], 'Focus within the execution section preserves capture');
documentStub.activeElement = null;
section.emit('focusout', { relatedTarget: { tagName: 'TEXTAREA' } });
typeText('4');
assert.equal(port(), 255);
assert.deepEqual(drain(), [], 'Editing elsewhere cannot send mobile input');
releaseTaps();
section.emit('focusin', { target: touchKeyboard });
simulator.audioStartPrompt = {};
typeText('5');
assert.deepEqual(drain(), [], 'The audio startup prompt cannot leak typing into a program');
simulator.audioStartPrompt = null;
typeText('6');
simulator.releaseAllKeys();
releaseTaps();
assert.equal(port(), 255);
assert.deepEqual(drain(), [], 'Reset and late touch release timers cannot revive old input');
console.log('Keyboard passed: physical keys, pointers, mobile text, composition, queued and held-key input, editing, and capture cleanup.');
