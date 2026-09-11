const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const mode = process.argv[2];
const options = {
  pattern: ['-po', 'size'],
  search: ['-so', 'size', '-so-threads', '4', '-so-blocksize', '2'],
  reorder: ['-ro', '-ro-no-inliner'],
};
if (!options[mode]) throw new Error('Use pattern, search, or reorder');
const input = process.argv[3] || 'baseline';
const args = ['-jar', 'tools/mdl.jar', `out/${input}.asm`, '-cpu', 'z80',
  ...options[mode], '-hex0x', '-out-colonless-equs',
  '-asm', `out/${mode}.asm`, '-bin', `out/${mode}.bin`];
console.log('java', args.join(' '));
const result = spawnSync('java', args, {cwd: __dirname, encoding: 'utf8'});
if (result.error) throw result.error;
const report = result.stdout + result.stderr;
fs.writeFileSync(path.join(__dirname, `${mode}-report.txt`), report);
console.log(report);
if (result.status !== 0) process.exit(result.status || 1);
