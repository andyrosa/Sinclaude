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
section.contains = target => target === section;
const buttons = [];
const gameButtons = { appendChild: button => buttons.push(button) };
const documentStub = Object.assign(eventTarget(), {
  querySelector: () => section,
  getElementById: id => id === 'gameButtons' ? gameButtons : { classList: { toggle() {} } },
  createElement: () => Object.assign(eventTarget(), { setPointerCapture(id) { this.capturedPointer = id; } }),
});
const windowStub = eventTarget();
const context = vm.createContext({ document: documentStub, window: windowStub });
const Simulator = vm.runInContext(
  fs.readFileSync(require.resolve('./simulator.js'), 'utf8') + '\nSimulator;', context);
const simulator = Object.create(Simulator.prototype);
simulator.ioMap = new Uint8Array(256);
simulator.initializeCharacterMappings();
simulator.initializeKeyMappings();
simulator.setupKeyboard();
simulator.createGameButtons();
const port = () => simulator.InPort(1);
const key = (type, name, code = name, extra = {}) =>
  documentStub.emit(type, { key: name, code, ...extra });
section.emit('mouseenter');
assert.equal(port(), 255, 'No key is held on initialization');

for (const [name, expected] of [
  [' ', 32], ['w', 87], ['W', 87], ['+', 43], ['%', 37], ['&', 38], ["'", 39], ['(', 40],
  ['Escape', 12], ['ArrowLeft', 144], ['ArrowUp', 145], ['ArrowRight', 146], ['ArrowDown', 147], ['Enter', 13],
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
for (const name of ['Shift', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Meta', 'F1', 'F12', 'Dead', 'Unidentified', 'Tab', 'é']) {
  key('keydown', name);
  assert.equal(port(), 87, name + ' does not replace held W');
  key('keyup', name);
  assert.equal(port(), 87, name + ' release does not release W');
}
key('keydown', 'a', 'KeyA');
assert.equal(port(), 65, 'Most recently pressed key wins');
key('keydown', 'w', 'KeyW', { repeat: true });
assert.equal(port(), 65, 'Repeats do not reorder held keys');
key('keyup', 'a', 'KeyA');
assert.equal(port(), 87, 'Releasing A restores held W');
key('keydown', 'a', 'KeyA');
key('keyup', 'w', 'KeyW');
assert.equal(port(), 65, 'Releasing an older key preserves the current key');
key('keyup', 'a', 'KeyA');
key('keydown', '%', 'Digit5');
key('keyup', '5', 'Digit5');
assert.equal(port(), 255, 'Releasing Shift first does not strand shifted punctuation');

key('keydown', 'w', 'KeyW');
buttons[2].emit('pointerdown', { pointerId: 3 });
assert.equal(port(), 32);
assert.equal(buttons[2].capturedPointer, 3, 'Pointer release remains routed to the button after dragging away');
buttons[2].emit('pointercancel', { pointerId: 3 });
assert.equal(port(), 87, 'Cancelling a pointer preserves the held keyboard key');
buttons[0].emit('pointerdown', { pointerId: 4 });
buttons[1].emit('pointerdown', { pointerId: 5 });
buttons[0].emit('pointerup', { pointerId: 4 });
assert.equal(port(), 83, 'One pointer release does not release another');
buttons[1].emit('lostpointercapture', { pointerId: 5 });
assert.equal(port(), 87);

for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SPAN', isContentEditable: true }]) {
  key('keydown', 'a', 'KeyA', { target });
  assert.equal(port(), 87, 'Editing does not press emulator keys');
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
documentStub.hidden = false;
documentStub.emit('visibilitychange');
key('keydown', 'w', 'KeyW');
assert.equal(port(), 87, 'Returning to the tab preserves capture but not stale held keys');
key('keyup', 'w', 'KeyW');
assert.equal(simulator.unicodeToSinclair(String.fromCharCode(18)), 32, 'Display fallback remains unchanged');
assert.equal(simulator.toReadableKeyLabel('arrowup'), 'ArrowUp');
assert.equal(simulator.toReadableKeyLabel('F1'), null);
console.log('Keyboard passed: punctuation, special keys, modifiers, simultaneous keys, repeats, pointers, editing, and capture cleanup.');
