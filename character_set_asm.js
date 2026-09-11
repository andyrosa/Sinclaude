// Compile the test card into ordinary Z80 data so it can be loaded, stepped,
// and rerun just like the other example programs.
// Shared with pattern_test.html so the preview and simulator use the same bytes.
const CHARACTER_TEST_PATTERNS = [
  [128,128,128, 128,128,128, 128,128,128], // Black
  [8,8,8, 8,8,8, 8,8,8],                 // Stipple
  [128,128,128, 0,0,0, 128,128,128],     // Horizontal, whole characters
  [3,3,3, 3,3,3, 3,3,3],                 // Horizontal, quarter blocks
  [128,0,128, 128,0,128, 128,0,128],     // Vertical, whole characters
  [5,5,5, 5,5,5, 5,5,5],                 // Vertical, quarter blocks
  [128,0,128, 0,128,0, 128,0,128],       // Checker, whole characters
  [134,134,134, 134,134,134, 134,134,134], // Checker, quarter blocks
  [134,0,6, 0,128,0, 6,0,134],          // X
];

const CHARACTER_SET_ASM = (() => {
  const charset = typeof module !== 'undefined' && module.exports ? require('./zx81_charset.js') : ZX81;
  const rows = Array.from({ length: 24 }, () => Array(32).fill(0));
  const text = (row, col, value) => {
    Array.from(value).forEach((char, offset) => { rows[row][col + offset] = charset.encodeCharacter(char); });
  };
  text(0, 7, 'CHARACTER SET TEST');
  rows[1].fill(131);
  for (let code = 0; code < 256; code += 16) {
    const row = 2 + code / 16;
    for (let group = 0; group < 4; group++) {
      const start = code + group * 4, col = group * 8;
      text(row, col, start.toString(16).toUpperCase().padStart(2, '0') + ':');
      for (let i = 0; i < 4; i++) rows[row][col + 3 + i] = start + i;
    }
  }
  for (let row = 18; row < 24; row++) {
    text(row, 0, `ROW${row}`);
    CHARACTER_TEST_PATTERNS.forEach((pattern, tile) => {
      for (let col = 0; col < 3; col++) {
        rows[row][5 + tile * 3 + col] = pattern[(row % 3) * 3 + col] ^ (row >= 21 ? 128 : 0);
      }
    });
  }
  return `; Character Set Test - all 256 codes, followed by graphics fill tests.
; Rows 18-20: ROW label | black | stipple | horizontal pair | vertical pair | checker pair | X.
; Rows 21-23: the negative of each 3x3 pattern directly above.
; Enable Retro Fonts to check the pixel-aligned graphics renderer.
ORG 0
  LD HL,character_data
  LD DE,60000
  LD BC,768
  LDIR
  HALT
character_data:
${rows.map((row, number) => `; Screen line ${number}\n  DB ${row.join(',')}`).join('\n')}
`;
})();

if (typeof window !== 'undefined') window.CHARACTER_SET_ASM = CHARACTER_SET_ASM;
if (typeof module !== 'undefined' && module.exports) module.exports = CHARACTER_SET_ASM;
