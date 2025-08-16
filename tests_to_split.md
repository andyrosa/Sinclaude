# Tests that should be split into single-operation tests

## Memory Store/Load Operations

### 1. "Direct memory store and load sequence" (lines ~789-794)
**Current test**: LD A, 0A5H; LD (1234H), A; LD A, 0; LD A, (1234H)
**Issue**: Tests both store and load operations
**Split into**:
- Test 1: "Store A to direct memory address" - `LD A, 0A5H; LD (1234H), A` → expect `[0x1234]=0xA5`
- Test 2: "Load A from direct memory address" - `LD (1234H), 0A5H; LD A, (1234H)` → expect `a=0xA5`

### 2. "Memory store via BC register pair" (lines ~796-798)
**Current test**: LD BC, 1234H; LD A, 0FFH; LD (BC), A; LD A, 0; LD A, (BC)
**Issue**: Tests both store and load via BC
**Split into**:
- Test 1: "Store A to memory via BC register pair" - `LD BC, 1234H; LD A, 0FFH; LD (BC), A` → expect `[0x1234]=0xFF`
- Test 2: "Load A from memory via BC register pair" - `LD BC, 1234H; LD (1234H), 0FFH; LD A, (BC)` → expect `a=0xFF`

### 3. "Memory store via DE register pair" (lines ~800-802)
**Current test**: LD DE, 1235H; LD A, 80H; LD (DE), A; LD A, 0; LD A, (DE)
**Issue**: Tests both store and load via DE
**Split into**:
- Test 1: "Store A to memory via DE register pair" - `LD DE, 1235H; LD A, 80H; LD (DE), A` → expect `[0x1235]=0x80`
- Test 2: "Load A from memory via DE register pair" - `LD DE, 1235H; LD (1235H), 80H; LD A, (DE)` → expect `a=0x80`

### 4. "Memory store and load to register" (lines ~804-808)
**Current test**: LD HL, 1236H; LD (HL), 7FH; LD B, (HL)
**Issue**: Tests both store immediate and load to register
**Split into**:
- Test 1: "Store immediate value to memory at HL" - `LD HL, 1236H; LD (HL), 7FH` → expect `[0x1236]=0x7F`
- Test 2: "Load from memory at HL to register B" - `LD HL, 1236H; LD (1236H), 7FH; LD B, (HL)` → expect `b=0x7F`

### 5. "Register to memory to register" (lines ~810-815)
**Current test**: LD HL, 1237H; LD B, 80H; LD (HL), B; LD A, (HL)
**Issue**: Tests both store from register and load to different register
**Split into**:
- Test 1: "Store register B to memory at HL" - `LD HL, 1237H; LD B, 80H; LD (HL), B` → expect `[0x1237]=0x80`
- Test 2: "Load from memory at HL to register A" - `LD HL, 1237H; LD (1237H), 80H; LD A, (HL)` → expect `a=0x80`

### 6. "Store L register to memory at HL" (lines ~817-822)
**Current test**: LD H, 12H; LD L, 38H; LD (HL), L; LD A, (HL)
**Issue**: Tests both store L and subsequent load to A
**Split into**:
- Test 1: "Store L register to memory at HL" - `LD H, 12H; LD L, 38H; LD (HL), L` → expect `[0x1238]=0x38`
- Test 2: "Load from memory at HL to register A" - `LD HL, 1238H; LD (1238H), 38H; LD A, (HL)` → expect `a=0x38`

### 7. "Store H register to memory at HL" (lines ~824-829)
**Current test**: LD H, 12H; LD L, 39H; LD (HL), H; LD A, (HL)
**Issue**: Tests both store H and subsequent load to A
**Split into**:
- Test 1: "Store H register to memory at HL" - `LD H, 12H; LD L, 39H; LD (HL), H` → expect `[0x1239]=0x12`
- Test 2: "Load from memory at HL to register A" - `LD HL, 1239H; LD (1239H), 12H; LD A, (HL)` → expect `a=0x12`

## Register Transfer Chain Tests

### 8. "Transfer A to E and back" (lines ~831-835)
**Current test**: LD A, 0FFH; LD E, A; LD A, E
**Issue**: Tests both A→E transfer and E→A transfer
**Split into**:
- Test 1: "Transfer A to E register" - `LD A, 0FFH; LD E, A` → expect `e=0xFF`
- Test 2: "Transfer E to A register" - `LD E, 0FFH; LD A, E` → expect `a=0xFF`

### 9. "Transfer A to L and back" (lines ~851-853)
**Current test**: LD A, 0FFH; LD L, A; LD A, L
**Split into**: A→L and L→A tests

### 10. "Transfer A to D and back" (lines ~857-859)
**Current test**: LD A, 80H; LD D, A; LD A, D
**Split into**: A→D and D→A tests

### 11. "Transfer A to B and back" (lines ~863-865)
**Current test**: LD A, 7FH; LD B, A; LD A, B
**Split into**: A→B and B→A tests

### 12. "Transfer A to H and back" (lines ~874-876)
**Current test**: LD A, 80H; LD H, A; LD A, H
**Split into**: A→H and H→A tests

## Complex Exchange Operations

### 13. "Exchange AF with shadow register" (lines ~879-885)
**Current test**: LD A, 0FFH; SCF; EX AF, AF'; XOR A; CCF; EX AF, AF'
**Issue**: Tests multiple operations: SCF, EX AF AF', XOR A, CCF, EX AF AF'
**Split into**:
- Test 1: "Exchange AF with shadow AF'" - Simple EX AF, AF' test
- Test 2: "Set carry flag with SCF" - SCF test (already exists)
- Test 3: "Clear carry flag with CCF" - CCF test (already exists)
- Test 4: "XOR A with itself" - XOR A test (already exists)

### 14. "Exchange DE and HL registers" (lines ~887-893)
**Current test**: LD D, 0FFH; LD E, 0; LD H, 0; LD L, 0FFH; EX DE, HL
**Issue**: This is actually acceptable as it's testing a single EX DE, HL operation with setup
**Keep as is** - setup is necessary for the exchange test

## Stack Operations

### 15. "Push and pop HL register pair" (lines ~1505-1513)
**Current test**: LD SP, 1248H; LD H, 80H; LD L, 7FH; PUSH HL; LD H, 0; LD L, 0; POP HL
**Issue**: Tests both PUSH and POP operations
**Split into**:
- Test 1: "Push HL to stack" - `LD SP, 1248H; LD H, 80H; LD L, 7FH; PUSH HL` → expect stack contents
- Test 2: "Pop from stack to HL" - `LD SP, 1246H; LD (1246H), 7FH; LD (1247H), 80H; POP HL` → expect `h=0x80, l=0x7F`

### 16. "Push and pop DE register pair" (lines ~1515-1523)
**Current test**: LD SP, 1248H; LD D, 0FFH; LD E, 0; PUSH DE; LD D, 0; LD E, 0; POP DE
**Split into**: PUSH DE and POP DE tests

### 17. "Push and pop AF with flags" (lines ~1525-1533)
**Current test**: LD SP, 1248H; LD A, 0FFH; SCF; PUSH AF; LD A, 0; CCF; POP AF
**Split into**: PUSH AF and POP AF tests

### 18. "Pop BC from stack" (lines ~1496-1503)
**Current test**: LD SP, 1246H; LD A, 0FFH; LD (1246H), A; LD A, 80H; LD (1247H), A; POP BC
**Issue**: Tests memory setup and POP operation together
**Split into**:
- Keep as single test but rename to "Pop BC from stack" (memory setup is necessary for POP test)

### 19. "Stack exchange EX (SP),HL" (lines ~1664-1672)
**Current test**: LD SP, 1000H; LD HL, 1000H; LD (HL), 56H; INC HL; LD (HL), 78H; LD HL, 1234H; EX (SP), HL
**Issue**: Tests memory setup and EX (SP),HL operation
**Keep as single test** - memory setup is necessary for the EX (SP),HL test

## I/O Operations

### 20. "Output and input port operation" (lines ~1624-1629)
**Current test**: LD A, 0FFH; OUT (7FH), A; LD A, 0; IN A, (7FH)
**Issue**: Tests both OUT and IN operations
**Split into**:
- Test 1: "Output A to port" - `LD A, 0FFH; OUT (7FH), A` → expect `port[0x7F]=0xFF`
- Test 2: "Input from port to A" - `OUT (7FH), 0FFH; LD A, 0; IN A, (7FH)` → expect `a=0xFF`

## Arithmetic with Memory Setup

### 21. "AND A with memory at HL" (lines ~1183-1188)
**Current test**: LD HL, 123CH; LD (HL), 0FH; LD A, 0F0H; AND (HL)
**Keep as single test** - memory setup is necessary for testing AND (HL) instruction

### 22. "OR A with memory at HL" (lines ~1211-1216)
**Current test**: LD HL, 123DH; LD (HL), 01H; LD A, 80H; OR (HL)
**Keep as single test** - memory setup is necessary for testing OR (HL) instruction

### 23. "Compare A with memory at HL" (lines ~1253-1258)
**Current test**: LD HL, 123EH; LD (HL), 80H; LD A, 80H; CP (HL)
**Keep as single test** - memory setup is necessary for testing CP (HL) instruction

### 24. "Arithmetic ADD A,(HL)" (lines ~1689-1694)
**Current test**: LD HL, 1000H; LD (HL), 10H; LD A, 20H; ADD A, (HL)
**Keep as single test** - memory setup is necessary for testing ADD A, (HL) instruction

### 25. "Arithmetic SUB (HL)" (lines ~1696-1701)
**Current test**: LD HL, 1000H; LD (HL), 10H; LD A, 20H; SUB (HL)
**Keep as single test** - memory setup is necessary for testing SUB (HL) instruction

## Summary

**Tests that SHOULD be split**: 20 tests
**Tests that should REMAIN as single tests**: 5 tests (necessary memory/setup operations for the target instruction)

The main principle: If a test verifies the results of multiple distinct operations (like store AND load), it should be split. If a test has setup operations that are necessary to test a single target instruction, it can remain as one test.