// Compile the test card into ordinary Z80 data so it can be loaded, stepped,
// and rerun just like the other example programs.
// Shared with pattern_test.html so the preview and simulator use the same bytes.
const CHARACTER_TEST_PATTERNS = [
  [160,160,160, 160,160,160, 160,160,160], // Black
  [7,7,7, 7,7,7, 7,7,7],                 // Stipple
  [160,160,160, 32,32,32, 160,160,160],   // Horizontal, whole characters
  [21,21,21, 21,21,21, 21,21,21],         // Horizontal, quarter blocks
  [160,32,160, 160,32,160, 160,32,160],   // Vertical, whole characters
  [6,6,6, 6,6,6, 6,6,6],                 // Vertical, quarter blocks
  [160,32,160, 32,160,32, 160,32,160],    // Checker, whole characters
  [18,18,18, 18,18,18, 18,18,18],         // Checker, quarter blocks
  [18,32,17, 32,160,32, 17,32,18],        // X
];

const CHARACTER_SET_ASM = (() => {
  const rows = Array.from({ length: 24 }, () => Array(32).fill(32));
  const text = (row, col, value) => {
    Array.from(value).forEach((char, offset) => { rows[row][col + offset] = char.charCodeAt(0); });
  };
  text(0, 7, 'CHARACTER SET TEST');
  rows[1].fill(8);
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
