// Z80 CPU Test Cases
// This file contains all the test cases for the Z80 CPU emulator
// The tests are separated from the test infrastructure for better organization

function runZ80CPUEmulatorTestClass(test, test_expect_error) {
  test("NOP");

  test("HALT", "halted=t");
   
  test("LD A, 0FFH", "a=0xFF");

  test("LD HL, 0FFFFH", "h=0xFF, l=0xFF");

  test(`
    LD A, 0A5H
    LD (1234H), A`,
    "a=0xA5, [0x1234]=0xA5",
    "Store A to direct memory address"
  );

  test(
    "LD BC, 1234H\nLD A, 0FFH\nLD (BC), A",
    "a=0xFF, b=0x12, c=0x34, [0x1234]=0xFF",
    "Store A to memory via BC register pair"
  );

  test(
    "LD DE, 1235H\nLD A, 80H\nLD (DE), A",
    "a=0x80, d=0x12, e=0x35, [0x1235]=0x80",
    "Store A to memory via DE register pair"
  );

  test(`
    LD HL, 1236H
    LD (HL), 7FH`,
    "h=0x12, l=0x36, [0x1236]=0x7F",
    "Store immediate value to memory at HL"
  );

  test(`
    LD HL, 1237H
    LD B, 80H
    LD (HL), B`,
    "b=0x80, h=0x12, l=0x37, [0x1237]=0x80",
    "Store register B to memory at HL"
  );

  test(`
    LD H, 12H
    LD L, 38H
    LD (HL), L`,
    "h=0x12, l=0x38, [0x1238]=0x38",
    "Store L register to memory at HL"
  );

  test(`
    LD H, 12H
    LD L, 39H
    LD (HL), H`,
    "h=0x12, l=0x39, [0x1239]=0x12",
    "Store H register to memory at HL"
  );

  test(`
    LD A, 0FFH
    LD E, A`,
    "a=0xFF, e=0xFF",
    "Transfer A to E register"
  );

  test(`
    LD E, 0FFH
    LD A, E`,
    "a=0xFF, e=0xFF",
    "Transfer E to A register"
  );

  test(`
    LD A, 80H
    LD C, A
    LD B, C`,
    "a=0x80, b=0x80, c=0x80",
    "Transfer A to C to B"
  );

  test(`
    LD A, 7FH
    LD H, A
    LD B, H`,
    "a=0x7F, h=0x7F, b=0x7F",
    "Transfer A to H to B"
  );

  test(`
    LD A, 0FFH
    LD L, A`,
    "a=0xFF, l=0xFF",
    "Transfer A to L register"
  );

  test(`
    LD L, 0FFH
    LD A, L`,
    "a=0xFF, l=0xFF",
    "Transfer L to A register"
  );

  test(`
    LD A, 80H
    LD D, A`,
    "a=0x80, d=0x80",
    "Transfer A to D register"
  );

  test(`
    LD D, 80H
    LD A, D`,
    "a=0x80, d=0x80",
    "Transfer D to A register"
  );

  test(`
    LD A, 7FH
    LD B, A`,
    "a=0x7F, b=0x7F",
    "Transfer A to B register"
  );

  test(`
    LD B, 7FH
    LD A, B`,
    "a=0x7F, b=0x7F",
    "Transfer B to A register"
  );

  test(`
    LD C, 0FFH
    LD A, C`,
    "a=0xFF, c=0xFF",
    "Load C and transfer to A"
  );

  test(`
    LD A, 80H
    LD H, A`,
    "a=0x80, h=0x80",
    "Transfer A to H register"
  );

  test(`
    LD H, 80H
    LD A, H`,
    "a=0x80, h=0x80",
    "Transfer H to A register"
  );

  test(`
    LD A, 0FFH
    SCF
    EX AF, AF'
    EX AF, AF'`,
    "a=0xFF, carry=t",
    "Exchange AF with shadow register"
  );

  test(`
    LD D, 0FFH
    LD E, 0
    LD H, 0
    LD L, 0FFH
    EX DE, HL`,
    "d=0x00, e=0xFF, h=0xFF, l=0x00",
    "Exchange DE and HL registers"
  );

  test(`
    LD A, 1
    INC A`,
    "a=0x02, zero=f",
    "Increment A register"
  );

  test(`
    LD A, 0FFH
    INC A`,
    "a=0x00, zero=t",
    "Increment A with overflow"
  );

  test(`
    LD A, 7FH
    INC A`,
    "a=0x80, zero=f",
    "Increment A to 0x80"
  );

  test(`
    LD B, 1
    INC B`,
    "b=0x02, zero=f",
    "Increment B register"
  );

  test(`
    LD B, 0FFH
    INC B`,
    "b=0x00, zero=t",
    "Increment B register with overflow"
  );

  test(`
    LD C, 0FEH
    INC C`,
    "c=0xFF, zero=f",
    "Increment C register"
  );

  test("INC D", "d=0x01, zero=f");

  test(`
    LD E, 7FH
    INC E`,
    "e=0x80, zero=f",
    "Increment E register"
  );

  test(`
    LD H, 0FFH
    INC H`,
    "h=0x00, zero=t",
    "Increment H register with overflow"
  );

  test(`
    LD L, 50H
    INC L`,
    "l=0x51, zero=f",
    "Increment L register"
  );

  test(`
    LD A, 1
    DEC A`,
    "a=0x00, zero=t",
    "Decrement A register"
  );

  test("DEC A", "a=0xFF, zero=f");

  test(`
    LD A, 80H
    DEC A`,
    "a=0x7F, zero=f",
    "Decrement A from 0x80"
  );

  test(`
    LD B, 1
    DEC B`,
    "b=0x00, zero=t",
    "Decrement B register"
  );

  test("DEC B", "b=0xFF, zero=f");

  test(`
    LD C, 80H
    DEC C`,
    "c=0x7F, zero=f",
    "Decrement C register"
  );

  test(`
    LD D, 2
    DEC D`,
    "d=0x01, zero=f",
    "Decrement D register"
  );

  test(`
    LD E, 1
    DEC E`,
    "e=0x00, zero=t",
    "Decrement E to zero"
  );

  test(`
    LD H, 81H
    DEC H`,
    "h=0x80, zero=f",
    "Decrement H register"
  );

  test("DEC L", "l=0xFF, zero=f");

  test(`
    LD HL, 123AH
    INC (HL)`,
    "zero=f, h=0x12, l=0x3A, [0x123A]=0x01",
    "Increment memory at HL"
  );

  test(`
    LD HL, 123BH
    DEC (HL)`,
    "zero=f, h=0x12, l=0x3B, [0x123B]=0xFF",
    "Decrement memory at HL"
  );

  test(`
    LD HL, 1
    INC HL`,
    "h=0x00, l=0x02",
    "Increment HL register pair"
  );

  test(`
    LD HL, 0FFFFH
    INC HL`,
    "h=0x00, l=0x00",
    "Increment HL with overflow"
  );

  test(`
    LD HL, 00FFH
    INC HL`,
    "h=0x01, l=0x00",
    "Increment HL with L overflow"
  );

  test(`
    LD BC, 1
    INC BC`,
    "b=0x00, c=0x02",
    "Increment BC register pair"
  );

  test(`
    LD BC, 0FFFFH
    INC BC`,
    "b=0x00, c=0x00",
    "Increment BC with overflow"
  );

  test(`
    LD DE, 00FFH
    INC DE`,
    "d=0x01, e=0x00",
    "Increment DE register pair"
  );

  test(`
    LD SP, 1000H
    INC SP`,
    "sp=0x1001",
    "Increment stack pointer"
  );

  test(`
    LD HL, 1
    DEC HL`,
    "h=0x00, l=0x00",
    "Decrement HL register pair"
  );

  test(`
    LD HL, 0
    DEC HL`,
    "h=0xFF, l=0xFF",
    "Decrement HL with underflow"
  );

  test(`
    LD HL, 100H
    DEC HL`,
    "h=0x00, l=0xFF",
    "Decrement HL from 0x100"
  );

  test(`
    LD BC, 1
    DEC BC`,
    "b=0x00, c=0x00",
    "Decrement BC register pair"
  );

  test(`
    LD BC, 0
    DEC BC`,
    "b=0xFF, c=0xFF",
    "Decrement BC with underflow"
  );

  test(`
    LD DE, 200H
    DEC DE`,
    "d=0x01, e=0xFF",
    "Decrement DE register pair"
  );

  test(`
    LD SP, 2000H
    DEC SP`,
    "sp=0x1FFF",
    "Decrement stack pointer"
  );

  test(`
    LD HL, 0FFFFH
    LD BC, 1
    ADD HL, BC`,
    "h=0x00, l=0x00, b=0x00, c=0x01, carry=t",
    "Add BC to HL with overflow"
  );

  test(`
    LD HL, 8000H
    LD DE, 8000H
    ADD HL, DE`,
    "h=0x00, l=0x00, d=0x80, e=0x00, carry=t",
    "Add DE to HL overflow test"
  );

  test(`
    LD HL, 8000H
    ADD HL, HL`,
    "h=0x00, l=0x00, carry=t",
    "Add HL to itself overflow test"
  );

  test(`
    LD HL, 1
    LD SP, 0FFFFH
    ADD HL, SP`,
    "h=0x00, l=0x00, sp=0xFFFF, carry=t",
    "Add SP to HL"
  );

  test(`
    LD A, 7FH
    LD B, 3
    ADD A, B`,
    "a=0x82, b=0x03, zero=f, carry=f",
    "Add B to A boundary test"
  );

  test(`
    LD A, 0FFH
    LD B, 1
    ADD A, B`,
    "a=0x00, b=0x01, zero=t, carry=t",
    "Add B to A with carry"
  );

  test(`
    LD A, 80H
    LD B, 80H
    ADD A, B`,
    "a=0x00, b=0x80, zero=t, carry=t",
    "Add B to A signed overflow"
  );

  test(`
    LD A, 80H
    ADD A, A`,
    "a=0x00, zero=t, carry=t",
    "Add A to itself overflow test"
  );

  test(`
    LD A, 10H
    ADD A, 0F0H`,
    "a=0x00, zero=t, carry=t",
    "Add immediate to A with carry"
  );

  test(`
    LD A, 80H
    LD H, 80H
    SCF
    ADC A, H`,
    "a=0x01, carry=t, zero=f, h=0x80",
    "Add H to A with carry set"
  );

  test(`
    SCF
    ADC A, 0`,
    "a=0x01, carry=f, zero=f",
    "Add immediate to A with carry"
  );

  test(`
    LD A, 0FFH
    LD B, 80H
    SUB B`,
    "a=0x7F, b=0x80, zero=f, carry=f",
    "Subtract B from A underflow test"
  );

  test(`
    LD A, 80H
    LD B, 0FFH
    SUB B`,
    "a=0x81, b=0xFF, zero=f, carry=t",
    "Subtract B from A borrow test"
  );

  test(`
    LD A, 0FFH
    LD B, 0FFH
    SUB B`,
    "a=0x00, b=0xFF, zero=t, carry=f",
    "Subtract B from A equal values"
  );

  test(`
    LD A, 80H
    LD H, 1
    SUB H`,
    "a=0x7F, h=0x01, carry=f, zero=f",
    "Subtract H from A"
  );

  test(`
    LD A, 80H
    SUB 0FFH`,
    "a=0x81, carry=t, zero=f",
    "Subtract immediate from A borrow test"
  );

  test(`
    LD A, 0FFH
    SUB A`,
    "a=0x00, zero=t, carry=f",
    "Subtract A from itself"
  );

  test(`
    LD A, 7FH
    LD B, 80H
    AND B`,
    "a=0x00, b=0x80, zero=t, carry=f",
    "AND A with B complementary bits"
  );

  test(`
    LD A, 0FFH
    LD B, 7FH
    AND B`,
    "a=0x7F, b=0x7F, zero=f, carry=f",
    "AND A with B mask operation"
  );

  test(`
    LD A, 0FFH
    LD B, 80H
    AND B`,
    "a=0x80, b=0x80, zero=f, carry=f",
    "AND A with B single bit"
  );

  test(`
    LD A, 0FFH
    AND A`,
    "a=0xFF, zero=f, carry=f",
    "AND A with itself"
  );

  test(`
    LD HL, 123CH
    LD (HL), 0FH
    LD A, 0F0H
    AND (HL)`,
    "a=0x00, zero=t, h=0x12, l=0x3C, carry=f, [0x123C]=0x0F",
    "AND A with memory at HL"
  );

  test(`
    LD A, 0FFH
    AND 7FH`,
    "a=0x7F, zero=f, carry=f",
    "AND A with immediate mask"
  );

  test(`
    LD A, 7FH
    LD B, 80H
    OR B`,
    "a=0xFF, b=0x80, zero=f, carry=f",
    "OR A with B complementary bits"
  );

  test(`
    LD B, 0
    OR B`,
    "a=0x00, b=0x00, zero=t, carry=f",
    "OR A with zero in B"
  );

  test(`
    LD A, 80H
    OR A`,
    "a=0x80, zero=f, carry=f",
    "OR A with itself"
  );

  test(`
    LD HL, 123DH
    LD (HL), 01H
    LD A, 80H
    OR (HL)`,
    "a=0x81, zero=f, h=0x12, l=0x3D, carry=f, [0x123D]=0x01",
    "OR A with memory at HL"
  );

  test(`
    LD A, 7FH
    OR 80H`,
    "a=0xFF, zero=f, carry=f",
    "OR A with immediate value"
  );

  test(`
    LD A, 0FFH
    XOR A`,
    "a=0x00, zero=t, carry=f",
    "XOR A with itself"
  );

  test(`
    LD A, 7FH
    XOR 80H`,
    "a=0xFF, zero=f, carry=f",
    "XOR A with immediate value"
  );

  test(`
    LD A, 0FFH
    CP 0FFH`,
    "a=0xFF, zero=t, carry=f",
    "Compare A with equal value"
  );

  test(`
    LD A, 80H
    CP 0FFH`,
    "a=0x80, zero=f, carry=t",
    "Compare A less than immediate"
  );

  test(`
    LD A, 0FFH
    CP 80H`,
    "a=0xFF, zero=f, carry=f",
    "Compare A greater than immediate"
  );

  test(`
    LD B, 0FFH
    CP B`,
    "a=0x00, b=0xFF, zero=f, carry=t",
    "Compare A with B register"
  );

  test(`
    LD HL, 123EH
    LD (HL), 80H
    LD A, 80H
    CP (HL)`,
    "a=0x80, zero=t, carry=f, h=0x12, l=0x3E, [0x123E]=0x80",
    "Compare A with memory at HL"
  );

  test("NEG", "a=0x00, zero=t, carry=f");

  test(`
    LD A, 1
    NEG`,
    "a=0xFF, zero=f, carry=t",
    "Negate A register"
  );

  test(`
    LD A, 80H
    NEG`,
    "a=0x80, zero=f, carry=t",
    "Negate A register value"
  );

  test("SCF", "carry=t");

  test(`
    SCF
    CCF`,
    "carry=f",
    "Set then complement carry flag"
  );

  test("CPL", "a=0xFF");

  test(`
    LD A, 7FH
    CPL`,
    "a=0x80",
    "Complement A register"
  );

  test(`
    LD A, 1
    RLCA`,
    "a=0x02, carry=f",
    "Rotate A left circular"
  );

  test(`
    LD A, 80H
    RLCA`,
    "a=0x01, carry=t",
    "Rotate A left circular with carry"
  );

  test(`
    LD A, 0FFH
    RLCA`,
    "a=0xFF, carry=t",
    "Rotate A left circular all bits set"
  );

  test(`
    LD A, 80H
    SLA A`,
    "a=0x00, zero=t, carry=t",
    "Shift A left arithmetic"
  );

  test(`
    LD B, 0FFH
    SRA B`,
    "b=0xFF, zero=f, carry=t",
    "Shift B right arithmetic"
  );

  test(`
    LD C, 01H
    SRL C`,
    "c=0x00, zero=t, carry=t",
    "Shift C right logical"
  );

  test(`
    LD HL, 123FH
    LD (HL), 01H
    SLA (HL)`,
    "carry=f, h=0x12, l=0x3F, zero=f, [0x123F]=0x02",
    "Shift memory left arithmetic"
  );

  test(`
    LD HL, 1240H
    LD (HL), 01H
    SRA (HL)`,
    "zero=t, carry=t, h=0x12, l=0x40, [0x1240]=0x00",
    "Shift memory right arithmetic"
  );

  test(`
    LD HL, 1241H
    LD (HL), 80H
    SRL (HL)`,
    "carry=f, h=0x12, l=0x41, zero=f, [0x1241]=0x40",
    "Shift memory right logical"
  );

  test(`
    LD A, 01H
    BIT 0, A`,
    "zero=f, a=0x01",
    "Test bit 0 of A register set"
  );

  test(`
    LD A, 0
    BIT 0, A`,
    "zero=t",
    "Test bit 0 of A register clear"
  );

  test(`
    LD A, 80H
    BIT 7, A`,
    "zero=f, a=0x80",
    "Test bit 7 of A register set"
  );

  test(`
    LD A, 0
    BIT 7, A`,
    "zero=t",
    "Test bit 7 of A register clear"
  );

  test(`
    LD A, 40H
    BIT 6, A`,
    "zero=f, a=0x40",
    "Test bit 6 of A register set"
  );

  test(`
    LD E, 80H
    BIT 7, E`,
    "zero=f, e=0x80",
    "Test bit 7 of E register"
  );

  test(`
    LD D, 00H
    BIT 7, D`,
    "zero=t",
    "Test bit 7 of D register clear"
  );

  test(`
    LD A, 80H
    RLA`,
    "carry=t Z0C0:a=0x00 Z0C1:a=0x01 Z1C0:a=0x00 Z1C1:a=0x01",
    "Rotate A left through carry"
  );

  test(`
    LD A, 01H
    RRA`,
    "carry=t Z0C0:a=0x00 Z0C1:a=0x80 Z1C0:a=0x00 Z1C1:a=0x80",
    "Rotate A right through carry"
  );

  test(`
    LD A, 01H
    RRCA`,
    "carry=t, a=0x80",
    "Rotate A right circular"
  );

  // CB-prefixed rotate instructions
  test(`
    LD A, 80H
    RLC A`,
    "carry=t, a=0x01, zero=f",
    "Rotate A left circular extended"
  );

  test(`
    LD B, 01H
    RRC B`,
    "carry=t, b=0x80, zero=f",
    "Rotate B right circular extended"
  );

  test(`
    LD A, 80H
    RL A`,
    "carry=t Z0C0:a=0x00,zero=t Z0C1:a=0x01,zero=f Z1C0:a=0x00,zero=t Z1C1:a=0x01,zero=f",
    "Rotate A left through carry extended"
  );

  test(`
    LD B, 01H
    RR B`,
    "carry=t Z0C0:b=0x00,zero=t Z0C1:b=0x80,zero=f Z1C0:b=0x00,zero=t Z1C1:b=0x80,zero=f",
    "Rotate B right through carry extended"
  );

  // SET bit operations
  test(`
    LD A, 00H
    SET 0, A`,
    "a=0x01",
    "Set bit 0 of A register"
  );

  test(`
    LD B, 00H
    SET 7, B`,
    "b=0x80",
    "Set bit 7 of B register"
  );

  test(`
    LD HL, 1240H
    LD (HL), 00H
    SET 0, (HL)`,
    "h=0x12, l=0x40, [0x1240]=0x01",
    "Set bit 0 of memory at HL"
  );

  // RES bit operations
  test(`
    LD A, 0FFH
    RES 0, A`,
    "a=0xFE",
    "Reset bit 0 of A register"
  );

  test(`
    LD B, 0FFH
    RES 7, B`,
    "b=0x7F",
    "Reset bit 7 of B register"
  );

  test(`
    LD HL, 1240H
    LD (HL), 0FFH
    RES 0, (HL)`,
    "h=0x12, l=0x40, [0x1240]=0xFE",
    "Reset bit 0 of memory at HL"
  );

  // SBC (Subtract with Carry) operations
  test(`
    LD A, 10H
    LD B, 05H
    SBC A, B`,
    "b=0x05, carry=f, zero=f Z0C0:a=0x0B Z0C1:a=0x0A Z1C0:a=0x0B Z1C1:a=0x0A",
    "Subtract B from A with borrow"
  );

  test(`
    LD A, 05H
    LD B, 10H
    SBC A, B`,
    "b=0x10, carry=t, zero=f Z0C0:a=0xF5 Z0C1:a=0xF4 Z1C0:a=0xF5 Z1C1:a=0xF4",
    "Subtract B from A with borrow"
  );

  test(`
    LD A, 05H
    SBC A, A`,
    "Z0C0:a=0x00,carry=f,zero=t Z0C1:a=0xFF,carry=t,zero=f Z1C0:a=0x00,carry=f,zero=t Z1C1:a=0xFF,carry=t,zero=f",
    "Subtract A from itself with borrow"
  );

  // SBC with carry flag set
  test(`
    LD A, 10H
    LD B, 05H
    SCF
    SBC A, B`,
    "a=0x0A, b=0x05, carry=f, zero=f",
    "Subtract B from A with carry set"
  );

  // LDIR test - non-overlapping regions
  test(`
    LD HL, 1240H
    LD (HL), 0FFH
    INC HL
    LD (HL), 80H
    INC HL
    LD (HL), 7FH
    LD DE, 1250H
    LD HL, 1240H
    LD BC, 2
    LDIR`,
    "h=0x12, l=0x42, d=0x12, e=0x52, b=0x00, c=0x00, [0x1240]=0xFF, [0x1241]=0x80, [0x1242]=0x7F, [0x1250]=0xFF, [0x1251]=0x80",
    "Load and increment repeat operation"
  );

  // LDIR test - overlapping regions (source overlaps destination)
  test(`
    LD HL, 1242H
    LD (HL), 0FFH
    INC HL
    LD (HL), 80H
    INC HL
    LD (HL), 7FH
    LD DE, 1243H
    LD HL, 1242H
    LD BC, 2
    LDIR`,
    "h=0x12, l=0x44, d=0x12, e=0x45, b=0x00, c=0x00, [0x1242]=0xFF, [0x1243]=0xFF, [0x1244]=0xFF",
    "Load and increment repeat with different source"
  );

  test("PUSH BC", "sp=0xFFFD, [0xFFFD]=0x00, [0xFFFE]=0x00");

  test(`
    LD SP, 1246H
    LD A, 0FFH
    LD (1246H), A
    LD A, 80H
    LD (1247H), A
    POP BC`,
    "b=0x80, c=0xFF, sp=0x1248, a=0x80, [0x1246]=0xFF, [0x1247]=0x80",
    "Pop BC from stack"
  );

  test(`
    LD SP, 1248H
    LD H, 80H
    LD L, 7FH
    PUSH HL`,
    "h=0x80, l=0x7F, sp=0x1246, [0x1246]=0x7F, [0x1247]=0x80",
    "Push HL to stack"
  );

  test(`
    LD SP, 1248H
    LD D, 0FFH
    LD E, 0
    PUSH DE`,
    "d=0xFF, e=0x00, sp=0x1246, [0x1246]=0x00, [0x1247]=0xFF",
    "Push DE to stack"
  );

  test(`
    LD SP, 1248H
    LD A, 0FFH
    SCF
    PUSH AF`,
    "a=0xFF, carry=t, sp=0x1246, [0x1247]=0xFF Z0C0:[0x1246]=0x01 Z0C1:[0x1246]=0x01 Z1C0:[0x1246]=0x41 Z1C1:[0x1246]=0x41",
    "Push AF to stack"
  );

  test("JR 3", "pc=3");

  test("CALL 100H", "pc=0x100, sp=0xFFFD, [0xFFFD]=0x03, [0xFFFE]=0x00");

  test(`
    CP 0
    JR Z, 5`,
    "pc=5, zero=t, carry=f",
    "Conditional jump relative if zero"
  );

  test(`
    CP 1
    JR NZ, 5`,
    "pc=5, zero=f, carry=t",
    "Conditional jump relative if not zero"
  );

  test(`
    SCF
    JR C, 7`,
    "pc=7, carry=t",
    "Conditional jump relative if carry"
  );

  test(`
    SCF
    JR NC, 7`,
    "pc=3, carry=t",
    "Conditional jump relative if no carry"
  );

  test(`
    LD B, 2
    DJNZ 5`,
    "pc=5, b=0x01",
    "Decrement B and jump if not zero"
  );

  test(`
    LD B, 1
    DJNZ 5`,
    "pc=4, b=0x00",
    "Decrement B to zero and jump test"
  );

  test("JP 1234H", "pc=0x1234");

  test(`
    CP 0
    JP Z, 1234H`,
    "pc=0x1234, zero=t, carry=f",
    "Conditional jump absolute if zero"
  );

  test(`
    CP 0
    JP NZ, 1234H`,
    "pc=5, zero=t, carry=f",
    "Conditional jump absolute if not zero"
  );

  test(`
    SCF
    JP C, 1234H`,
    "pc=0x1234, carry=t",
    "Conditional jump absolute if carry"
  );

  test(`
    SCF
    JP NC, 1234H`,
    "pc=4, carry=t",
    "Conditional jump absolute if no carry"
  );

  test(`
    LD SP, 1248H
    LD HL, 1234H
    PUSH HL
    RET`,
    "pc=0x1234, sp=0x1248, h=0x12, l=0x34, [0x1246]=0x34, [0x1247]=0x12",
    "Return from subroutine"
  );

  test(`
    CP 0
    LD SP, 1248H
    LD HL, 0FFH
    PUSH HL
    RET Z`,
    "pc=0xFF, sp=0x1248, zero=t, carry=f, h=0x00, l=0xFF, [0x1246]=0xFF, [0x1247]=0x00",
    "Conditional return if zero"
  );

  test(`
    CP 0
    RET NZ`,
    "pc=3, zero=t, carry=f",
    "Conditional return if not zero"
  );

  test(`
    SCF
    LD SP, 1248H
    LD HL, 80H
    PUSH HL
    RET C`,
    "pc=0x80, sp=0x1248, carry=t, h=0x00, l=0x80, [0x1246]=0x80, [0x1247]=0x00",
    "Conditional return if carry"
  );

  test(`
    SCF
    RET NC`,
    "pc=2, carry=t",
    "Conditional return if no carry"
  );

  test(`
    LD A, 0FFH
    OUT (7FH), A`,
    "a=0xFF, port[0x7F]=0xFF",
    "Output A to port"
  );

  test(`
    CP 0
    CALL Z, 100H`,
    "pc=0x100, sp=0xFFFD, zero=t, carry=f, [0xFFFD]=0x05, [0xFFFE]=0x00",
    "Conditional CALL Z - should call when zero flag set"
  );

  test(`
    CP 0
    CALL NZ, 100H`,
    "pc=5, sp=0xFFFF, zero=t, carry=f",
    "Conditional CALL NZ - should not call when zero flag set"
  );

  test(`
    SCF
    CALL C, 100H`,
    "pc=0x100, sp=0xFFFD, carry=t, [0xFFFD]=0x04, [0xFFFE]=0x00",
    "Conditional CALL C - should call when carry flag set"
  );

  test(`
    SCF
    CALL NC, 100H`,
    "pc=4, sp=0xFFFF, carry=t",
    "Conditional CALL NC - should not call when carry flag set"
  );

  test(`
    LD HL, 1234H
    LD (5678H), HL`,
    "h=0x12, l=0x34, [0x5678]=0x34, [0x5679]=0x12",
    "Memory store LD (nn),HL - store HL to direct address"
  );

  test(`
    LD HL, 5678H
    LD (HL), 34H
    LD HL, 5679H
    LD (HL), 12H
    LD HL, (5678H)`,
    "h=0x12, l=0x34, [0x5678]=0x34, [0x5679]=0x12",
    "Memory load LD HL,(nn) - load HL from direct address"
  );

  test(`
    LD SP, 1000H
    LD HL, 1000H
    LD (HL), 56H
    INC HL
    LD (HL), 78H
    LD HL, 1234H
    EX (SP), HL`,
    "h=0x78, l=0x56, sp=0x1000, [0x1000]=0x34, [0x1001]=0x12",
    "Stack exchange EX (SP),HL - exchange HL with top of stack"
  );

  test(`
    LD HL, 1234H
    JP (HL)`,
    "pc=0x1234, h=0x12, l=0x34",
    "Indirect jump JP (HL) - jump to address in HL"
  );

  test(`
    LD B, 12H
    LD C, B`,
    "b=0x12, c=0x12",
    "Register LD C,B - copy B register to C"
  );
  test(`
    LD D, 34H
    LD E, D`,
    "d=0x34, e=0x34",
    "Register LD E,D - copy D register to E"
  );
  test(`
    LD H, 56H
    LD L, H`,
    "h=0x56, l=0x56",
    "Register LD L,H - copy H register to L"
  );
  test(`
    LD A, 78H
    LD B, A
    LD C, B`,
    "a=0x78, b=0x78, c=0x78",
    "Register LD chain - A to B to C"
  );

  test(`
    LD HL, 1000H
    LD (HL), 10H
    LD A, 20H
    ADD A, (HL)`,
    "a=0x30, h=0x10, l=0x00, [0x1000]=0x10, zero=f, carry=f",
    "Arithmetic ADD A,(HL) - add memory content to A"
  );

  test(`
    LD HL, 1000H
    LD (HL), 10H
    LD A, 20H
    SUB (HL)`,
    "a=0x10, h=0x10, l=0x00, [0x1000]=0x10, zero=f, carry=f",
    "Arithmetic SUB (HL) - subtract memory content from A"
  );

  test(`
    LD A, 0FFH
    LD B, 0F0H
    XOR B`,
    "a=0x0F, b=0xF0, zero=f, carry=f",
    "Logic XOR B - XOR A with B register"
  );

  test(`
    LD A, 0AAH
    LD C, 055H
    XOR C`,
    "a=0xFF, c=0x55, zero=f, carry=f",
    "Logic XOR C - XOR A with C register"
  );

  test(`
    LD A, 12H
    XOR A`,
    "a=0x00, zero=t, carry=f",
    "Logic XOR A - XOR A with itself (clear A)"
  );

  test(`
    LD A, 10H
    LD B, 10H
    CP B`,
    "a=0x10, b=0x10, zero=t, carry=f",
    "Compare CP B - compare A with B (equal)"
  );
  test(`
    LD A, 10H
    LD C, 20H
    CP C`,
    "a=0x10, c=0x20, zero=f, carry=t",
    "Compare CP C - compare A with C (A < C)"
  );
  test(`
    LD A, 20H
    LD D, 10H
    CP D`,
    "a=0x20, d=0x10, zero=f, carry=f",
    "Compare CP D - compare A with D (A > D)"
  );
  test(`
    LD A, 15H
    CP A`,
      "a=0x15, zero=t, carry=f",
    "Compare CP A - compare A with itself (equal)"
  );

  // Test that expects a specific error message - should pass when it gets the expected error
  test_expect_error("LD HL,0\nLD (HL),0", "Unexpected memory changes: [0x0000]: 0x21→0x00");
}

// Export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = runZ80CPUEmulatorTestClass;
}

// Make available globally for browser use
if (typeof window !== "undefined") {
  window.runZ80CPUEmulatorTestClass = runZ80CPUEmulatorTestClass;
}
