// ZX81 BASIC Programming, Appendix A. Only 0-63 and 128-191 are
// single-cell display characters; BASIC tokens and controls are not glyphs.
const ZX81 = (() => {
  const characters = Object.freeze([
    ' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▒', '▒', '▒',
    ...'"£$:?()><=+-*/;,.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ]);
  const codes = new Map();
  characters.forEach((char, code) => {
    // The half-grey bitmaps share a Unicode approximation with full grey.
    if (!codes.has(char)) codes.set(char, code);
  });
  [...'█▟▙▄▜▐▚▗'].forEach((char, code) => codes.set(char, 128 + code));
  const keys = Object.freeze({
    Space: 0, ArrowUp: 112, ArrowDown: 113, ArrowLeft: 114,
    ArrowRight: 115, Enter: 118, Backspace: 119,
    Escape: 227, // The Escape shortcut sends the ZX81 STOP token.
  });
  const codeFor = char => codes.get(char.toUpperCase());
  function encodeCharacter(char) {
    // Source escapes express ZX81 NEWLINE and a zero byte. Other raw bytes
    // must be written numerically rather than disguised as Unicode text.
    if (char === '\n' || char === '\r') return keys.Enter;
    if (char === '\0') return 0;
    const code = codeFor(char);
    if (code === undefined) throw new Error(`Character ${JSON.stringify(char)} is not in the ZX81 character set`);
    return code;
  }
  function decodeCharacter(byte) {
    const code = byte & 127;
    return code < characters.length ? characters[code] : '⸮';
  }
  return Object.freeze({
    characters, codes, keys, codeFor, encodeCharacter, decodeCharacter,
    encode: text => Array.from(text, encodeCharacter),
    decode: bytes => Array.from(bytes, decodeCharacter).join(''),
  });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZX81;
