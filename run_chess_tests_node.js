const assert = require('node:assert/strict');
require('./node_test_globals.js');

function verifyChess(createCPU = () => new Z80CPU()) {
  const assembler = new Z80Assembler();
  const assembled = assembler.assemble(require('./chess_asm.js'));
  assert.ok(assembled.success, JSON.stringify(assembled.errors));
  const s = {...assembler.symbols};
  const image = new Uint8Array(65536);
  Z80Assembler.loadOpcodesIntoMemory(image, assembled.instructionDetails);
  assert.equal(assembled.instructionDetails.reduce((n, line) => n + line.opcodes.length, 0), s.END_CODE, 'Payload is contiguous, with no hidden address gaps');
  assert.ok(s.END_CODE <= 1236, 'Keep the complete game within the measured byte budget');
  for (const name of ['GLYPHS','VALUES']) assert.equal(s[name] >> 8, (s[name] + 6) >> 8, name + ': lookup stays within one page');
  const squares = Array.from({length: 64}, (_, i) => (i >> 3) * 16 + i % 8);
  const address = square => (Number(square[1]) - 1) * 16 + square.charCodeAt(0) - 97;
  const algebraic = n => String.fromCharCode(97 + (n & 7)) + (1 + (n >> 4));
  const promotion = {q: 5, r: 4, b: 3, n: 2};
  function fenBoard(fen) {
    const board = new Uint8Array(130);
    const [position, side, rights, ep] = fen.split(' ');
    position.split('/').forEach((rank, i) => {
      let file = 0;
      for (const c of rank) {
        if (/\d/.test(c)) file += Number(c);
        else {
          const type = ' pnbrqk'.indexOf(c.toLowerCase());
          board[(7 - i) * 16 + file++] = type | (c === c.toLowerCase() ? 8 : 0) | 16;
        }
      }
    });
    for (const [right, king, rook] of [['K',4,7],['Q',4,0],['k',116,119],['q',116,112]]) {
      if (rights.includes(right)) {board[king] &= 15; board[rook] &= 15;}
    }
    board[128] = side === 'b' ? 8 : 0;
    board[129] = ep === '-' ? 0 : address(ep);
    return board;
  }
  const boardOnly = board => squares.map(n => board[n] & 15);
  function castling(board) {
    return [['K',4,7,0],['Q',4,0,0],['k',116,119,8],['q',116,112,8]]
      .filter(([,king,rook,side]) => board[king] === (6 | side) && board[rook] === (4 | side))
      .map(([right]) => right).join('') || '-';
  }
  let totalSteps = 0, maxSteps = 0, maxStack = 0, checkedMoves = 0, keyboardTurns = 0;
  function machine(fen) {
    const memory = image.slice(), io = new Uint8Array(256).fill(255), cpu = createCPU();
    if (fen) memory.set(fenBoard(fen), s.BOARD);
    cpu.memory = memory; cpu.iomap = io; cpu.set(0, 65534);
    let steps = 0;
    return {cpu, memory, io,
      step() {
        assert.ok(++steps < 20000000, `Instruction limit at ${cpu.PC.toString(16)}`);
        assert.equal(cpu.executeInstruction(), null);
        totalSteps++;
        maxStack = Math.max(maxStack, 65534 - cpu.SP);
      },
      call(label) {
        const before = steps;
        cpu.pushWord(0xffff); cpu.PC = s[label];
        while (cpu.PC !== 0xffff) this.step();
        maxSteps = Math.max(maxSteps, steps - before);
      },
      move(uci) {
        memory[s.FROM] = address(uci.slice(0,2)); memory[s.TO] = address(uci.slice(2,4));
        memory[s.PROMOTION] = uci[4] ? promotion[uci[4]] : 5;
        this.call('MAKE');
      },
      state() {return memory.slice(s.BOARD, s.BOARD + 130);},
      board() {return boardOnly(this.state());},
    };
  }
  const fixtures = require('./chess_rules_cases.json').cases;
  for (const test of fixtures) {
    const m = machine(test.fen), original = m.state(), generated = [];
    m.call('CHECK');
    assert.equal(m.cpu.flagC, test.check, test.name + ': check');
    for (const from of squares) {
      m.memory[s.FROM] = from;
      m.call('GENERATE');
      assert.deepEqual(m.state(), original, test.name + ': generation preserves board/state');
      const destinations = [...m.memory.slice(s.MOVES, s.MOVES + m.cpu.regs[3])];
      for (const to of destinations) {
        const suffixes = (original[from] & 7) === 1 && [0,0x70].includes(to & 0x70) ? ['q','r','b','n'] : [''];
        for (const suffix of suffixes) {
          const uci = algebraic(from) + algebraic(to) + suffix;
          m.memory[s.FROM] = from; m.memory[s.TO] = to;
          m.memory[s.PROMOTION] = suffix ? promotion[suffix] : 5;
          m.call('TRY_MOVE');
          const legal = !m.cpu.flagC;
          m.call('RESTORE_TRIAL');
          assert.deepEqual(m.state(), original, `${test.name}: ${uci} undo`);
          if (legal) generated.push(uci);
        }
      }
    }
    assert.deepEqual(generated.sort(), test.moves.map(m => m.uci).sort(), test.name + ': complete legal move set');
    for (const move of test.moves) {
      const trial = machine(test.fen);
      trial.move(move.uci);
      assert.deepEqual(trial.board(), boardOnly(fenBoard(move.after)), `${test.name}: ${move.uci} board`);
      assert.equal(castling(trial.state()), move.after.split(' ')[2], `${test.name}: ${move.uci} castling rights`);
      const from = address(move.uci.slice(0,2)), to = address(move.uci.slice(2,4));
      assert.equal(trial.memory[s.EP], (original[from] & 7) === 1 && Math.abs(to - from) === 32 ? (to + from) / 2 : 0, `${test.name}: ${move.uci} EP`);
      assert.equal(trial.memory[s.SIDE], move.after.split(' ')[1] === 'b' ? 8 : 0);
      checkedMoves++;
    }
    const computer = machine(test.fen);
    computer.call('SEARCH');
    if (!test.moves.length) assert.equal(computer.memory[s.BEST_SCORE], 0, test.name + ': no legal move');
    else {
      assert.notEqual(computer.memory[s.BEST_SCORE], 0, test.name + ': computer finds move');
      assert.deepEqual(computer.state(), original, test.name + ': search preserves position');
      computer.call('BEST_MOVE');
      const matches = test.moves.filter(move => JSON.stringify(boardOnly(fenBoard(move.after))) === JSON.stringify(computer.board()));
      assert.ok(matches.length, test.name + ': computer chooses oracle-legal move');
      if (test.name.includes('knight underpromotion')) assert.ok(matches[0].uci.endsWith('n'), test.name);
      if (test.name.endsWith('quiet promotion')) assert.ok(matches[0].uci.endsWith('q'), test.name);
    }
    assert.deepEqual(computer.memory.slice(0,s.END_CODE), image.slice(0,s.END_CODE), 'Search never changes code');
  }
  for (const [name, fen, fresh, expected] of [
    ['central knight', '7k/8/8/8/8/8/8/1N2K3 w - - 0 1', 'b1', 'b1c3'],
    ['central black knight', '1n2k3/8/8/8/8/8/8/7K b - - 0 1', 'b8', 'b8c6'],
    ['develop another piece', '7k/8/8/8/8/8/8/1N2KB2 w - - 0 1', 'f1', 'f1d3'],
    ['capture before position', '7k/8/8/8/8/p7/8/1N2K3 w - - 0 1', 'b1', 'b1a3'],
    ['avoid attacked centre', '7k/8/8/8/3p4/8/8/1N2K3 w - - 0 1', 'b1', 'b1d2'],
    ['develop before moving king', '7k/8/8/8/8/2K5/8/1N6 w - - 0 1', 'b1', 'b1d2'],
  ]) {
    const m = machine(fen);
    m.memory[s.BOARD + address(fresh)] &= ~16;
    m.call('SEARCH');
    assert.equal(algebraic(m.memory[s.BEST_FROM]) + algebraic(m.memory[s.BEST_TO]), expected, name);
  }
  function humanMove(m, uci) {
    const keys = ZX81.encode(uci.slice(0,4));
    if (uci[4]) keys.push(...ZX81.encode('05X'), 34 - promotion[uci[4]]);
    m.cpu.InPort = port => {
      assert.equal(port, 5, 'Queued keystrokes survive fast taps');
      return keys.length ? keys.shift() : 255;
    };
    m.cpu.PC = s.DRIVER;
    do {m.step();} while (m.cpu.PC !== s.MAIN && !(m.cpu.PC === s.KEY && !keys.length));
    assert.equal(keys.length, 0, 'Move and promotion keys consumed');
    return m.cpu.PC === s.MAIN;
  }
  for (const test of fixtures) for (const move of test.moves.filter((move, i) => move.replies || i === 0)) {
    const m = machine(test.fen);
    assert.ok(humanMove(m, move.uci), `${test.name}: keyboard accepts ${move.uci}`);
    assert.deepEqual(m.board(), boardOnly(fenBoard(move.after)), `${test.name}: keyboard board`);
    assert.equal(castling(m.state()), move.after.split(' ')[2], `${test.name}: keyboard rights`);
    if (move.replies) {
      m.call('SEARCH');
      if (!move.replies.length) assert.equal(m.memory[s.BEST_SCORE], 0, test.name + ': no reply');
      else {
        m.call('BEST_MOVE');
        assert.ok(move.replies.some(reply => JSON.stringify(boardOnly(fenBoard(reply))) === JSON.stringify(m.board())), test.name + ': legal computer reply');
      }
    }
    keyboardTurns++;
  }
  for (const [name, uci] of [
    ['initial','e2e5'], ['initial','a1a3'], ['initial','e7e5'], ['initial','e2e2'],
    ['castle through check','e1g1'], ['en passant vertical pin','e5d6'],
    ['en passant horizontal pin','g5f6'], ['en passant diagonal pin','d5e6'],
  ]) {
    const m = machine(fixtures.find(test => test.name === name).fen), before = m.state();
    assert.equal(humanMove(m, uci), false, name + ': rejects illegal input');
    assert.deepEqual(m.state(), before, name + ': rejection preserves position and rights');
    assert.equal(m.memory[60324], 15, 'Invalid move leaves a visible question mark');
  }
  for (const sequence of [['h1h2','h8h7','h2h1','h7h8'],['e1e2','e8e7','e2e1','e7e8']]) {
    const m = machine(fixtures.find(test => test.name === 'both white castles').fen);
    for (const uci of sequence) m.move(uci);
    assert.equal(castling(m.state()), sequence[0][0] === 'h' ? 'Qq' : '-', 'Returning king/rook never restores rights');
  }
  const openings = fixtures.find(test => test.name === 'initial').moves;
  const reset = machine(fixtures.find(test => test.name === 'white en passant').fen);
  reset.memory.fill(88, 60000, 60768);
  reset.cpu.PC = s.CHESS_START;
  let reads = 0;
  reset.cpu.InPort = () => {reads++; return 255;};
  do {reset.step();} while (reset.cpu.PC !== s.KEY);
  assert.equal(reads, 0, 'Startup needs no key');
  const opening = openings.find(move => JSON.stringify(boardOnly(fenBoard(move.after))) === JSON.stringify(reset.board()));
  assert.ok(opening, 'The computer plays a legal opening before accepting input');
  assert.ok(['d2d4','e2e4'].includes(opening.uci), 'The computer opens by occupying the centre with a pawn');
  assert.equal(castling(reset.state()), 'KQkq');
  assert.equal(reset.memory[s.EP], (address(opening.uci.slice(0,2)) + address(opening.uci.slice(2,4))) / 2);
  assert.equal(reset.memory[s.SIDE], 8);
  const text = (row, length) => ZX81.decode(reset.memory.slice(60000+row*32,60000+row*32+length));
  assert.equal(text(0,9), ' HGFEDCBA', 'File labels start at the top left');
  assert.equal(text(9,10), 'BLACK E7E5');
  assert.equal(text(10,5), '---- ');
  assert.equal(text(11,8), '1Q2R3B4N');
  for (let rank = 0; rank < 8; rank++) {
    assert.equal(reset.memory[60032+rank*32], 29+rank);
    for (let file = 0; file < 8; file++) {
      const piece = reset.memory[s.BOARD+rank*16+file];
      assert.equal(reset.memory[60033+rank*32+7-file], ZX81.encodeCharacter('.PNBRQK'[piece & 7]) | ((piece & 8) << 4), 'Every screen square matches the board');
    }
  }
  for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
    if (row >= 12 || col >= 10) assert.equal(reset.memory[60000+row*32+col], 0, 'Unused screen stays blank');
  }
  for (const test of fixtures.filter(test => !test.moves.length)) {
    const m = machine(test.fen);
    m.cpu.PC = s.MAIN;
    do {m.step();} while (m.cpu.PC !== s.NO_MOVE);
    assert.equal(ZX81.decode(m.memory.slice(60320,60324)), test.check ? 'MATE' : 'DRAW', test.name + ': game-over status');
    assert.deepEqual(m.board(), boardOnly(fenBoard(test.fen)), 'Game over does not change board');
  }
  console.log(`1.3K Chess passed: ${s.END_CODE} loaded bytes; ${fixtures.length} positions, ${checkedMoves} legal moves, make/undo, positional decisions, ${keyboardTurns} keyboard turns, illegal input, reset, top-left display, mate/stalemate; max ${maxSteps} instructions, ${maxStack} stack bytes (${totalSteps} instructions total).`);
  return {machine, symbols: s, fixtures, address, fenBoard};
}
module.exports = verifyChess;
if (require.main === module) verifyChess();
