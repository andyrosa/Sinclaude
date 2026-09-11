const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
require('../../node_test_globals.js');
let source = require('../../chess_asm.js');
if (process.argv[2]) {
  const module = {exports: {}};
  vm.runInNewContext(execFileSync('git', ['show', `${process.argv[2]}:chess_asm.js`],
    {encoding: 'utf8', cwd: path.join(__dirname, '../..')}), {module});
  source = module.exports;
}
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, {recursive: true});
// MDL uses ASCII literals. Resolve ZX81 literals before comparing binaries.
const numeric = source.split('\n').map(line => {
  const comment = line.indexOf(';');
  const code = comment < 0 ? line : line.slice(0, comment);
  return code.replace(/(['"])(.*?)\1/g, (_, quote, value) => ZX81.encode(value).join(',')) +
    (comment < 0 ? '' : line.slice(comment));
}).join('\n');
function assemble(text) {
  const result = new Z80Assembler().assemble(text);
  assert.ok(result.success, JSON.stringify(result.errors));
  return Buffer.from(result.instructionDetails.flatMap(line => line.opcodes));
}
assert.deepEqual(assemble(numeric), assemble(source));
fs.writeFileSync(path.join(out, 'baseline.asm'), numeric);
fs.writeFileSync(path.join(out, 'baseline.bin'), assemble(source));
console.log(`Prepared ${assemble(source).length}-byte baseline with identical ZX81 encoding.`);
