const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('../../node_test_globals.js');
const candidate = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
const modulePath = require.resolve('../../chess_asm.js');
require(modulePath);
// Inject only into this test process; the production source remains untouched.
require.cache[modulePath].exports = candidate;
const assembler = new Z80Assembler();
const compiled = assembler.assemble(candidate);
assert.ok(compiled.success, JSON.stringify(compiled.errors));
const bytes = Buffer.from(compiled.instructionDetails.flatMap(line => line.opcodes));
if (process.argv[3]) assert.deepEqual(bytes, fs.readFileSync(path.resolve(process.argv[3])));
require('../../run_chess_tests_node.js')();
console.log(`Candidate validated: ${bytes.length} bytes.`);
