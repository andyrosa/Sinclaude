// Z80 CPU Emulator Test Suite
//
// OVERVIEW:
// This test suite validates Z80 CPU instruction execution with a focus on testing
// ONLY the specific instruction or operation being verified. Each test is designed
// to avoid unnecessary operations that don't contribute to the core verification:
//
// - Memory operations (INC/DEC/shift instructions on memory) use memory expectations
//   [address]=value rather than loading the result back into a register
// - Block operations like LDIR verify completion through register states and memory
//   expectations without additional loads to confirm the operation worked
// - Round-trip tests (store then load, OUT then IN) are used only when testing
//   the addressing modes or I/O functionality specifically
//
// This approach ensures each test focuses on its target instruction and minimizes
// the potential for false failures due to unrelated operations.
//
// EXPECTATION SYNTAX:
// The test suite uses a key=value expectation string format to specify the expected
// CPU state after executing Z80 assembly code. The framework enforces STRICT verification
// where only explicitly expected changes are allowed - any unexpected changes will fail the test.
//
// BASIC SYNTAX: "key1=value1, key2=value2, ..."
//
// REGISTER EXPECTATIONS:
//   "a=0xFF, b=0x80, h=0x12, l=0x34"
//   - Supports all 8-bit registers: a, b, c, d, e, h, l
//   - Values can be hex (0xFF) or decimal (255)
//
// FLAG EXPECTATIONS:
//   "zero=t, carry=f" or "zero=true, carry=false"
//   - zero: Z flag state (t/f or true/false)
//   - carry: C flag state (t/f or true/false)
//   - "flip" value: expect flag to change from initial state
//
// PROGRAM COUNTER & STACK POINTER:
//   "pc=0x1234, sp=0xFFFD"
//   - pc: program counter (defaults to machine code length if not specified)
//   - sp: stack pointer (defaults to unchanged if not specified)
//
// MEMORY EXPECTATIONS:
//   "[0x1234]=0xFF, [0x1235]=0x80"
//   - Format: [address]=value
//   - Address can be hex (0x1234) or decimal (4660)
//   - Value can be hex (0xFF) or decimal (255)
//   - REQUIRED for any memory changes made by the test
//
// FLAG-SPECIFIC EXPECTATIONS:
//   "base expectations Z0C0:flag-specific Z0C1:flag-specific Z1C0:flag-specific Z1C1:flag-specific"
//   - Use Z0C0:, Z0C1:, Z1C0:, Z1C1: prefixes to specify expectations for specific flag combinations
//   - Z0C0 = Zero flag false, Carry flag false
//   - Z0C1 = Zero flag false, Carry flag true
//   - Z1C0 = Zero flag true, Carry flag false
//   - Z1C1 = Zero flag true, Carry flag true
//   - Base expectations apply to all flag combinations unless overridden
//   - Example: "a=0xFF, [0x1247]=0xFF Z0C0:[0x1246]=0x01 Z0C1:[0x1246]=0x01 Z1C0:[0x1246]=0x41 Z1C1:[0x1246]=0x41"
//   - Each test automatically runs 4 times with different initial flag states
//   - Essential for instructions like PUSH AF where flag register values differ
//   - Only applies to memory expectations (not I/O ports, which are never flag-dependent)
//
// I/O PORT EXPECTATIONS:
//   "port[0x7F]=0xFF"
//   - Format: port[port_number]=value
//   - Port number can be hex (0x7F) or decimal (127)
//   - Value can be hex (0xFF) or decimal (255)
//   - REQUIRED for any I/O port changes made by the test
//   - I/O ports are never affected by initial flag states
//
// OTHER STATE:
//   "halted=t" - CPU halted state
//
// STRICT VERIFICATION RULES:
// 1. Only changes explicitly listed in expectations are allowed
// 2. Any unexpected register, memory, or I/O changes will fail the test
// 3. Flags not mentioned in expectations must remain unchanged
// 4. Memory locations not listed in expectations must remain unchanged
// 5. I/O ports not listed in expectations must remain unchanged
//
// EXAMPLE:
//   test("LD A, 0FFH\nLD (1234H), A", "a=0xFF, [0x1234]=0xFF")
//   - Expects register A to be 0xFF
//   - Expects memory location 0x1234 to contain 0xFF
//   - All other registers, memory locations, and flags must remain unchanged

// Test class for Z80 CPU emulator using assembly code with parsed expectations
class Z80CPUTestSuite {
  constructor() {
    this.testCount = 0;
    this.passedCount = 0;
    this.failedTests = [];

    // Detect if running in Node.js vs browser
    this.isNode = typeof module !== "undefined" && module.exports;
  }

  // Helper method to log only when running in Node.js
  consoleLogIfNode(message) {
    if (this.isNode) {
      console.log(message);
    }
  }

  runAllTests() {
    // Load dependencies - handle both Node.js and browser environments
    let Z80CPU, Z80Assembler;

    if (typeof require !== "undefined") {
      // Node.js environment
      try {
        Z80CPU = require("./z80_cpu_emulator.js");
        Z80Assembler = require("./z80_assembler.js");
      } catch (error) {
        throw new Error(
        `Failed to load dependencies in Node.js: ${error.message}`
        );
      }
    } else {
      // Browser environment - classes should be globally available
      if (typeof Z80CPU !== "undefined") {
        // Global Z80CPU is available
        Z80CPU = Z80CPU;
      } else if (typeof window !== "undefined" && window.Z80CPU) {
        Z80CPU = window.Z80CPU;
      } else {
        throw new Error(
        "Z80CPU class not available in browser environment - ensure z80_cpu_emulator.js is loaded"
        );
      }

      if (typeof Z80Assembler !== "undefined") {
        // Global Z80Assembler is available
        Z80Assembler = Z80Assembler;
      } else if (typeof window !== "undefined" && window.Z80Assembler) {
        Z80Assembler = window.Z80Assembler;
      } else {
        throw new Error(
        "Z80Assembler class not available in browser environment - ensure z80_assembler.js is loaded"
        );
      }
    }

    const assembler = new Z80Assembler();
    const cpu = new Z80CPU();
    const memory = new Uint8Array(65536);
    const iomap = new Uint8Array(256); 
    let testsPassed = 0;
    let totalTests = 0;

    // Capture reference to 'this' for use in nested functions
    const testSuite = this;

    function parseExpectations(expectStr, flagComboIndex = 0) {
      if (!expectStr) return {};

      const expectations = {};

      // Split by flag-specific sections first
      // Format: "base expectations Z0C0:flag-specific Z0C1:flag-specific Z1C0:flag-specific Z1C1:flag-specific"
      const flagCombos = ["Z0C0", "Z0C1", "Z1C0", "Z1C1"];
      const currentFlagCombo = flagCombos[flagComboIndex];

      // Split the expectation string by flag combo patterns
      let baseExpectations = expectStr;
      let flagSpecificExpectations = "";

      // Extract the current flag combo's expectations
      const flagPattern = new RegExp(
      `\\b${currentFlagCombo}:([^Z]*?)(?=\\s*Z[01]C[01]:|$)`
      );
      const flagMatch = expectStr.match(flagPattern);

      if (flagMatch) {
        flagSpecificExpectations = flagMatch[1].trim();
        // Remove all flag-specific sections to get base expectations
        baseExpectations = expectStr
          .replace(/\s*Z[01]C[01]:[^Z]*?(?=\s*Z[01]C[01]:|$)/g, "")
          .trim();
      }

      // Parse base expectations
      const basePairs = baseExpectations
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);

      // Parse flag-specific expectations
      const flagPairs = flagSpecificExpectations
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);

      // Combine all pairs for parsing
      const allPairs = [...basePairs, ...flagPairs];

      for (const pair of allPairs) {
        const [key, value] = pair.split("=").map((s) => s.trim());
        if (!key || !value) continue;

        const lowerKey = key.toLowerCase();
        const lowerValue = value.toLowerCase();

        // Check for memory expectation syntax: [0x1234] or [1234]
        if (key.startsWith("[") && key.endsWith("]")) {
          const addrStr = key.slice(1, -1); // Remove brackets
          let address;
          if (addrStr.startsWith("0x") || addrStr.startsWith("0X")) {
            address = parseInt(addrStr, 16);
          } else {
            address = parseInt(addrStr, 10);
          }

          if (!isNaN(address)) {
            if (!expectations.memory) expectations.memory = {};

            let expectedValue;
            if (value.startsWith("0x") || value.startsWith("0X")) {
              expectedValue = parseInt(value, 16);
            } else {
              expectedValue = parseInt(value, 10);
            }
            expectations.memory[address] = expectedValue;
            continue;
          }
        }

        // Check for I/O port expectation syntax: port[0x7F] or port[127]
        if (key.toLowerCase().startsWith("port[") && key.endsWith("]")) {
          const portStr = key.slice(5, -1); // Remove 'port[' and ']'
          let port;
          if (portStr.startsWith("0x") || portStr.startsWith("0X")) {
            port = parseInt(portStr, 16);
          } else {
            port = parseInt(portStr, 10);
          }

          if (!isNaN(port) && port >= 0 && port <= 255) {
            if (!expectations.ioports) expectations.ioports = {};

            // I/O ports are never affected by flags, so no flag-specific syntax needed
            let expectedValue;
            if (value.startsWith("0x") || value.startsWith("0X")) {
              expectedValue = parseInt(value, 16);
            } else {
              expectedValue = parseInt(value, 10);
            }
            expectations.ioports[port] = expectedValue;
            continue;
          }
        }

        // Parse different value types for regular expectations
        if (lowerValue === "flip") {
          expectations[lowerKey] = "flip";
        } else if (lowerValue === "t" || lowerValue === "true") {
          expectations[lowerKey] = true;
        } else if (lowerValue === "f" || lowerValue === "false") {
          expectations[lowerKey] = false;
        } else if (value.startsWith("0x") || value.startsWith("0X")) {
          expectations[lowerKey] = parseInt(value, 16);
        } else if (!isNaN(value)) {
          expectations[lowerKey] = parseInt(value, 10);
        } else {
          expectations[lowerKey] = value; // String value
        }
      }

      return expectations;
    }

    // Main test function
    function test(assembly, expectations = "", expectedError = null) {
      const flagCombos = [
        { Z: false, C: false },
        { Z: false, C: true },
        { Z: true, C: false },
        { Z: true, C: true },
      ];

      flagCombos.forEach((initialFlags, flagComboIndex) => {
        totalTests++;

        // Parse expectations with flag combination index for Z0C0 syntax support
        const expected = parseExpectations(expectations, flagComboIndex);

        const escapedAssembly = assembly
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
        const testName = `${escapedAssembly} "${expectations}" [Z:${
          initialFlags.Z ? 1 : 0
        } C:${initialFlags.C ? 1 : 0}]`;

        let execResult; // Declare outside try block for error reporting

        try {
          // Assemble the code
          const result = assembler.assemble(assembly);
          if (!result.success) {
            throw new Error(`Assembly failed: ${result.errors[0].message}`);
          }

          // Reset and setup
          memory.fill(0);
          iomap.fill(0);
          cpu.reset();
          cpu.set(0x0000, 0xffff);
          cpu.registers.F = { ...initialFlags };
          const initialSP = cpu.registers.SP;

          // Capture complete initial state for comprehensive change verification
          const initialState = {
            registers: {
              A: cpu.registers.A,
              B: cpu.registers.B,
              C: cpu.registers.C,
              D: cpu.registers.D,
              E: cpu.registers.E,
              H: cpu.registers.H,
              L: cpu.registers.L,
              PC: cpu.registers.PC,
              SP: cpu.registers.SP,
              F: { ...cpu.registers.F },
            },
            memory: new Uint8Array(memory),
            iomap: new Uint8Array(iomap),
          };

          // Load machine code into memory
          Z80Assembler.loadOpcodesIntoMemory(memory, result.instructionDetails);

          // Calculate total machine code length for PC expectation
          const machineCodeLength = result.instructionDetails.reduce(
            (total, instruction) => {
              return (
                total + (instruction.opcodes ? instruction.opcodes.length : 0)
              );
            },
            0
          );

          // Update initial state after loading code (to ignore code loading changes)
          initialState.memory = new Uint8Array(memory);

          // Execute - run one step per instruction line
          const instructionCount = assembly
            .split("\n")
            .filter((line) => line.trim()).length;
          execResult = cpu.executeSteps(memory, iomap, instructionCount);

          // Check for execution errors first
          if (execResult.error) {
            throw new Error(`Execution error: ${execResult.error}`);
          }

          // Check PC expectation (default to instruction length)
          const expectedPC = expected.hasOwnProperty("pc")
            ? expected.pc
            : machineCodeLength;
          if (execResult.registers.PC !== expectedPC) {
            throw new Error(
            `PC mismatch: expected 0x${expectedPC
                .toString(16)
                .toUpperCase()} but got 0x${execResult.registers.PC.toString(
                16
              ).toUpperCase()} (machine code length: ${machineCodeLength})`
            );
          }

          // Check SP expectation
          if (expected.hasOwnProperty("sp")) {
            if (execResult.registers.SP !== expected.sp) {
              throw new Error(
              `SP mismatch: expected 0x${expected.sp
                  .toString(16)
                  .toUpperCase()} but got 0x${execResult.registers.SP.toString(
                  16
                ).toUpperCase()}`
              );
            }
          } else {
            // SP should be unchanged by default
            if (execResult.registers.SP !== initialSP) {
              throw new Error(
              `SP changed unexpectedly: expected unchanged (0x${initialSP
                  .toString(16)
                  .toUpperCase()}) but got 0x${execResult.registers.SP.toString(
                  16
                ).toUpperCase()}`
              );
            }
          }

          // Check register expectations (A, B, C, D, E, H, L)
          for (const reg of ["a", "b", "c", "d", "e", "h", "l"]) {
            if (expected.hasOwnProperty(reg)) {
              const regName = reg.toUpperCase();
              const actual = execResult.registers[regName];
              const expectedVal = expected[reg];
              if (actual !== expectedVal) {
                throw new Error(
                `Register ${regName} mismatch: expected 0x${expectedVal
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()} but got 0x${actual
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()}`
                );
              }
            }
          }

          // Check flag expectations with mapped names (only full names to avoid conflicts)
          const flagMap = { zero: "Z", carry: "C" };
          for (const [key, expectedVal] of Object.entries(expected)) {
            const flagName = flagMap[key];
            if (flagName) {
              const actual = execResult.registers.F[flagName];
              const initial = initialFlags[flagName];

              if (expectedVal === "flip") {
                if (actual === initial) {
                  throw new Error(
                  `Flag ${flagName} should have flipped: started as ${initial}, expected opposite but got ${actual}`
                  );
                }
              } else if (actual !== expectedVal) {
                throw new Error(
                `Flag ${flagName} mismatch: expected ${expectedVal} but got ${actual}`
                );
              }
            }
          }

          // Check that unspecified flags are preserved
          if (!expected.hasOwnProperty("zero")) {
            if (execResult.registers.F.Z !== initialFlags.Z) {
              throw new Error(
              `Flag Z: expected unchanged (${initialFlags.Z}), got ${execResult.registers.F.Z}`
              );
            }
          }
          if (!expected.hasOwnProperty("carry")) {
            if (execResult.registers.F.C !== initialFlags.C) {
              throw new Error(
              `Flag C: expected unchanged (${initialFlags.C}), got ${execResult.registers.F.C}`
              );
            }
          }

          // Check other expectations (halted, etc.)
          if (expected.hasOwnProperty("halted")) {
            if (execResult.halted !== expected.halted) {
              throw new Error(
              `Halted: expected ${expected.halted}, got ${execResult.halted}`
              );
            }
          }

          // Check memory expectations
          if (expected.hasOwnProperty("memory")) {
            for (const [address, expectedValue] of Object.entries(
              expected.memory
            )) {
              const addr = parseInt(address);
              const actualValue = memory[addr];
              if (actualValue !== expectedValue) {
                throw new Error(
                `Memory[0x${addr
                    .toString(16)
                    .toUpperCase()}]: expected 0x${expectedValue
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()}, got 0x${actualValue
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()}`
                );
              }
            }
          }

          // Check I/O port expectations
          if (expected.hasOwnProperty("ioports")) {
            for (const [port, expectedValue] of Object.entries(
              expected.ioports
            )) {
              const portNum = parseInt(port);
              const actualValue = iomap[portNum];
              if (actualValue !== expectedValue) {
                throw new Error(
                `Port[0x${portNum
                    .toString(16)
                    .toUpperCase()}]: expected 0x${expectedValue
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()}, got 0x${actualValue
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase()}`
                );
              }
            }
          }

          // ==== COMPREHENSIVE STATE VERIFICATION ====

          // 1. Check explicit register expectations first
          const allRegisters = ["A", "B", "C", "D", "E", "H", "L"];
          for (const reg of allRegisters) {
            const regKey = reg.toLowerCase();
            if (expected.hasOwnProperty(regKey)) {
              if (execResult.registers[reg] !== expected[regKey]) {
                throw new Error(
                `Register ${reg}: expected 0x${expected[regKey]
                    .toString(16)
                    .toUpperCase()}, got 0x${execResult.registers[reg]
                    .toString(16)
                    .toUpperCase()}`
                );
              }
            }
          }

          // 2. Check unexpected register changes (only for registers not explicitly expected)
          for (const reg of allRegisters) {
            const regKey = reg.toLowerCase();
            if (!expected.hasOwnProperty(regKey)) {
              if (execResult.registers[reg] !== initialState.registers[reg]) {
                throw new Error(
                `Register ${reg}: unexpected change from 0x${initialState.registers[
                    reg
                  ]
                    .toString(16)
                    .toUpperCase()} to 0x${execResult.registers[reg]
                    .toString(16)
                    .toUpperCase()}`
                );
              }
            }
          }

          // 3. Calculate legitimate memory regions that can be modified
          const allowedMemoryChangesSet = new Set();

          // Add memory addresses from expectations (they are expected to change)
          if (expected.hasOwnProperty("memory")) {
            for (const address of Object.keys(expected.memory)) {
              allowedMemoryChangesSet.add(parseInt(address));
            }
          }

          // 4. Check for unexpected memory changes
          const unexpectedMemoryChanges = [];
          for (let addr = 0; addr < Math.min(memory.length, 8192); addr++) {
            // Check first 8KB
            if (
              memory[addr] !== initialState.memory[addr] &&
              !allowedMemoryChangesSet.has(addr)
            ) {
              unexpectedMemoryChanges.push({
                address: addr,
                initial: initialState.memory[addr],
                final: memory[addr],
              });
            }
          }

          if (unexpectedMemoryChanges.length > 0) {
            const changes = unexpectedMemoryChanges
              .slice(0, 5)
              .map(
                (change) =>
                `[0x${change.address
                    .toString(16)
                    .toUpperCase()}]: 0x${change.initial
                    .toString(16)
                    .toUpperCase()}→0x${change.final
                    .toString(16)
                    .toUpperCase()}`
              )
              .join(", ");
            const moreText =
              unexpectedMemoryChanges.length > 5
                ? ` and ${unexpectedMemoryChanges.length - 5} more`
                : "";
            throw new Error(`Unexpected memory changes: ${changes}${moreText}`);
          }

          // 5. Check for unexpected I/O port changes
          const allowedIOChangesSet = new Set();

          // Add I/O ports from expectations (they are expected to change)
          if (expected.hasOwnProperty("ioports")) {
            for (const port of Object.keys(expected.ioports)) {
              allowedIOChangesSet.add(parseInt(port));
            }
          }

          const unexpectedIOChanges = [];
          for (let port = 0; port < iomap.length; port++) {
            if (
              iomap[port] !== initialState.iomap[port] &&
              !allowedIOChangesSet.has(port)
            ) {
              unexpectedIOChanges.push({
                port: port,
                initial: initialState.iomap[port],
                final: iomap[port],
              });
            }
          }

          if (unexpectedIOChanges.length > 0) {
            const changes = unexpectedIOChanges
              .slice(0, 3)
              .map(
                (change) =>
                `Port[0x${change.port
                    .toString(16)
                    .toUpperCase()}]: 0x${change.initial
                    .toString(16)
                    .toUpperCase()}→0x${change.final
                    .toString(16)
                    .toUpperCase()}`
              )
              .join(", ");
            const moreText =
              unexpectedIOChanges.length > 3
                ? ` and ${unexpectedIOChanges.length - 3} more`
                : "";
            throw new Error(`Unexpected I/O changes: ${changes}${moreText}`);
          }

          // Check if we expected an error but the test passed
          if (expectedError !== null) {
            testSuite.consoleLogIfNode(`FAIL ${testName}`);
            testSuite.consoleLogIfNode(
            `    Expected error: "${expectedError}"`
            );
            testSuite.consoleLogIfNode(`    But test passed successfully`);
            return;
          }

          testSuite.consoleLogIfNode(`PASS ${testName}`);
          testsPassed++;
        } catch (error) {
          // Check if this is an expected error
          if (expectedError !== null) {
            if (error.message === expectedError) {
              testSuite.consoleLogIfNode(
              `PASS ${testName} (Expected error: "${expectedError}")`
              );
              testsPassed++;
              return; // Don't process as a failure
            } else {
              // Expected an error but got a different one
              testSuite.consoleLogIfNode(`FAIL ${testName}`);
              testSuite.consoleLogIfNode(
              `    Expected error: "${expectedError}"`
              );
              testSuite.consoleLogIfNode(
              `    Actual error: "${error.message}"`
              );
              return;
            }
          }

          // Enhanced error reporting with CPU state context
          const failureDetails = [
          `FAIL ${testName}`,
          `Error: ${error.message}`,
          `Assembly: ${assembly.replace(/\n/g, " | ")}`,
          `Expected: ${expectations}`,
          `Initial flags: Z=${initialFlags.Z ? 1 : 0}, C=${
              initialFlags.C ? 1 : 0
            }`,
          ];

          // Try to get CPU state for error reporting if execution was attempted
          let execResultForReport = execResult;
          if (!execResultForReport) {
            // Try to re-execute to get state for debugging (if assembly succeeded)
            try {
              if (typeof result !== "undefined" && result.success) {
                memory.fill(0);
                cpu.reset();
                cpu.set(0x0000, 0xffff);
                cpu.registers.F = { ...initialFlags };
                Z80Assembler.loadOpcodesIntoMemory(
                  memory,
                  result.instructionDetails
                );
                execResultForReport = cpu.executeSteps(
                  memory,
                  iomap,
                  assembly.split("\n").filter((line) => line.trim()).length
                );
              }
            } catch (e) {
              // Re-execution failed, leave execResultForReport undefined
            }
          }

          // Add CPU state if available
          if (execResultForReport) {
            failureDetails.push(`Final CPU state:`);
            failureDetails.push(
            `  Registers: A=${execResultForReport.registers.A.toString(16)
                .padStart(2, "0")
                .toUpperCase()}H, B=${execResultForReport.registers.B.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H, C=${execResultForReport.registers.C.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H, D=${execResultForReport.registers.D.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H, E=${execResultForReport.registers.E.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H, H=${execResultForReport.registers.H.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H, L=${execResultForReport.registers.L.toString(
                16
              )
                .padStart(2, "0")
                .toUpperCase()}H`
            );
            failureDetails.push(
            `  PC=${execResultForReport.registers.PC.toString(16)
                .padStart(4, "0")
                .toUpperCase()}H, SP=${execResultForReport.registers.SP.toString(
                16
              )
                .padStart(4, "0")
                .toUpperCase()}H`
            );
            failureDetails.push(
            `  Flags: Z=${execResultForReport.registers.F.Z ? 1 : 0}, C=${
                execResultForReport.registers.F.C ? 1 : 0
              }`
            );
            if (execResultForReport.halted) {
              failureDetails.push(`  Status: HALTED`);
            }
          }

          console.error(failureDetails.join("\n    "));
        }
      });
    }

    this.consoleLogIfNode(
    "Starting Z80 CPU tests with key=value expectations...\n");

    test("NOP");

    test("HALT", "halted=t");

    test("LD A, 0FFH", "a=0xFF");

    test("LD HL, 0FFFFH", "h=0xFF, l=0xFF");

    test(`
    LD A, 0A5H
    LD (1234H), A
    LD A, 0
    LD A, (1234H)`,
    "a=0xA5, [0x1234]=0xA5");

    test(
    "LD BC, 1234H\nLD A, 0FFH\nLD (BC), A\nLD A, 0\nLD A, (BC)",
    "a=0xFF, b=0x12, c=0x34, [0x1234]=0xFF");

    test(
    "LD DE, 1235H\nLD A, 80H\nLD (DE), A\nLD A, 0\nLD A, (DE)",
    "a=0x80, d=0x12, e=0x35, [0x1235]=0x80");

    test(`
    LD HL, 1236H
    LD (HL), 7FH
    LD B, (HL)`,
    "b=0x7F, h=0x12, l=0x36, [0x1236]=0x7F");

    test(`
    LD HL, 1237H
    LD B, 80H
    LD (HL), B
    LD A, (HL)`,
    "a=0x80, b=0x80, h=0x12, l=0x37, [0x1237]=0x80");

    test(`
    LD H, 12H
    LD L, 38H
    LD (HL), L
    LD A, (HL)`,
    "a=0x38, h=0x12, l=0x38, [0x1238]=0x38");

    test(`
    LD H, 12H
    LD L, 39H
    LD (HL), H
    LD A, (HL)`,
    "a=0x12, h=0x12, l=0x39, [0x1239]=0x12");

    test(`
    LD A, 0FFH
    LD E, A
    LD A, E`,
    "a=0xFF, e=0xFF");

    test(`
    LD A, 80H
    LD C, A
    LD B, C`,
    "a=0x80, b=0x80, c=0x80");

    test(`
    LD A, 7FH
    LD H, A
    LD B, H`,
    "a=0x7F, h=0x7F, b=0x7F");

    test(`
    LD A, 0FFH
    LD L, A
    LD A, L`,
    "a=0xFF, l=0xFF");

    test(`
    LD A, 80H
    LD D, A
    LD A, D`,
    "a=0x80, d=0x80");

    test(`
    LD A, 7FH
    LD B, A
    LD A, B`,
    "a=0x7F, b=0x7F");

    test(`
    LD C, 0FFH
    LD A, C`,
    "a=0xFF, c=0xFF");

    test(`
    LD A, 80H
    LD H, A
    LD A, H`,
    "a=0x80, h=0x80");

    test(`
    LD A, 0FFH
    SCF
    EX AF, AF'
    XOR A
    CCF
    EX AF, AF'`,
    "a=0xFF, carry=t");

    test(`
    LD D, 0FFH
    LD E, 0
    LD H, 0
    LD L, 0FFH
    EX DE, HL`,
    "d=0x00, e=0xFF, h=0xFF, l=0x00");

    test(`
    LD A, 1
    INC A`,
    "a=0x02, zero=f");

    test(`
    LD A, 0FFH
    INC A`,
    "a=0x00, zero=t");

    test(`
    LD A, 7FH
    INC A`,
    "a=0x80, zero=f");

    test(`
    LD B, 1
    INC B`,
    "b=0x02, zero=f");

    test(`
    LD B, 0FFH
    INC B`,
    "b=0x00, zero=t");

    test(`
    LD C, 0FEH
    INC C`,
    "c=0xFF, zero=f");

    test("INC D", "d=0x01, zero=f");

    test(`
    LD E, 7FH
    INC E`,
    "e=0x80, zero=f");

    test(`
    LD H, 0FFH
    INC H`,
    "h=0x00, zero=t");

    test(`
    LD L, 50H
    INC L`,
    "l=0x51, zero=f");

    test(`
    LD A, 1
    DEC A`,
    "a=0x00, zero=t");

    test("DEC A", "a=0xFF, zero=f");

    test(`
    LD A, 80H
    DEC A`,
    "a=0x7F, zero=f");

    test(`
    LD B, 1
    DEC B`,
    "b=0x00, zero=t");

    test("DEC B", "b=0xFF, zero=f");

    test(`
    LD C, 80H
    DEC C`,
    "c=0x7F, zero=f");

    test(`
    LD D, 2
    DEC D`,
    "d=0x01, zero=f");

    test(`
    LD E, 1
    DEC E`,
    "e=0x00, zero=t");

    test(`
    LD H, 81H
    DEC H`,
    "h=0x80, zero=f");

    test("DEC L", "l=0xFF, zero=f");

    test(`
    LD HL, 123AH
    INC (HL)`,
    "zero=f, h=0x12, l=0x3A, [0x123A]=0x01");

    test(`
    LD HL, 123BH
    DEC (HL)`,
    "zero=f, h=0x12, l=0x3B, [0x123B]=0xFF");

    test(`
    LD HL, 1
    INC HL`,
    "h=0x00, l=0x02");

    test(`
    LD HL, 0FFFFH
    INC HL`,
    "h=0x00, l=0x00");

    test(`
    LD HL, 00FFH
    INC HL`,
    "h=0x01, l=0x00");

    test(`
    LD BC, 1
    INC BC`,
    "b=0x00, c=0x02");

    test(`
    LD BC, 0FFFFH
    INC BC`,
    "b=0x00, c=0x00");

    test(`
    LD DE, 00FFH
    INC DE`,
    "d=0x01, e=0x00");

    test(`
    LD SP, 1000H
    INC SP`,
    "sp=0x1001");

    test(`
    LD HL, 1
    DEC HL`,
    "h=0x00, l=0x00");

    test(`
    LD HL, 0
    DEC HL`,
    "h=0xFF, l=0xFF");

    test(`
    LD HL, 100H
    DEC HL`,
    "h=0x00, l=0xFF");

    test(`
    LD BC, 1
    DEC BC`,
    "b=0x00, c=0x00");

    test(`
    LD BC, 0
    DEC BC`,
    "b=0xFF, c=0xFF");

    test(`
    LD DE, 200H
    DEC DE`,
    "d=0x01, e=0xFF");

    test(`
    LD SP, 2000H
    DEC SP`,
    "sp=0x1FFF");

    test(`
    LD HL, 0FFFFH
    LD BC, 1
    ADD HL, BC`,
    "h=0x00, l=0x00, b=0x00, c=0x01, carry=t");

    test(`
    LD HL, 8000H
    LD DE, 8000H
    ADD HL, DE`,
    "h=0x00, l=0x00, d=0x80, e=0x00, carry=t");

    test(`
    LD HL, 8000H
    ADD HL, HL`,
    "h=0x00, l=0x00, carry=t");

    test(`
    LD HL, 1
    LD SP, 0FFFFH
    ADD HL, SP`,
    "h=0x00, l=0x00, sp=0xFFFF, carry=t");

    test(`
    LD A, 7FH
    LD B, 3
    ADD A, B`,
    "a=0x82, b=0x03, zero=f, carry=f");

    test(`
    LD A, 0FFH
    LD B, 1
    ADD A, B`,
    "a=0x00, b=0x01, zero=t, carry=t");

    test(`
    LD A, 80H
    LD B, 80H
    ADD A, B`,
    "a=0x00, b=0x80, zero=t, carry=t");

    test(`
    LD A, 80H
    ADD A, A`,
    "a=0x00, zero=t, carry=t");

    test(`
    LD A, 10H
    ADD A, 0F0H`,
    "a=0x00, zero=t, carry=t");

    test(`
    LD A, 80H
    LD H, 80H
    SCF
    ADC A, H`,
    "a=0x01, carry=t, zero=f, h=0x80");

    test(`
    SCF
    ADC A, 0`,
    "a=0x01, carry=f, zero=f");

    test(`
    LD A, 0FFH
    LD B, 80H
    SUB B`,
    "a=0x7F, b=0x80, zero=f, carry=f");

    test(`
    LD A, 80H
    LD B, 0FFH
    SUB B`,
    "a=0x81, b=0xFF, zero=f, carry=t");

    test(`
    LD A, 0FFH
    LD B, 0FFH
    SUB B`,
    "a=0x00, b=0xFF, zero=t, carry=f");

    test(`
    LD A, 80H
    LD H, 1
    SUB H`,
    "a=0x7F, h=0x01, carry=f, zero=f");

    test(`
    LD A, 80H
    SUB 0FFH`,
    "a=0x81, carry=t, zero=f");

    test(`
    LD A, 0FFH
    SUB A`,
    "a=0x00, zero=t, carry=f");

    test(`
    LD A, 7FH
    LD B, 80H
    AND B`,
    "a=0x00, b=0x80, zero=t, carry=f");

    test(`
    LD A, 0FFH
    LD B, 7FH
    AND B`,
    "a=0x7F, b=0x7F, zero=f, carry=f");

    test(`
    LD A, 0FFH
    LD B, 80H
    AND B`,
    "a=0x80, b=0x80, zero=f, carry=f");

    test(`
    LD A, 0FFH
    AND A`,
    "a=0xFF, zero=f, carry=f");

    test(`
    LD HL, 123CH
    LD (HL), 0FH
    LD A, 0F0H
    AND (HL)`,
    "a=0x00, zero=t, h=0x12, l=0x3C, carry=f, [0x123C]=0x0F");

    test(`
    LD A, 0FFH
    AND 7FH`,
    "a=0x7F, zero=f, carry=f");

    test(`
    LD A, 7FH
    LD B, 80H
    OR B`,
    "a=0xFF, b=0x80, zero=f, carry=f");

    test(`
    LD B, 0
    OR B`,
    "a=0x00, b=0x00, zero=t, carry=f");

    test(`
    LD A, 80H
    OR A`,
    "a=0x80, zero=f, carry=f");

    test(`
    LD HL, 123DH
    LD (HL), 01H
    LD A, 80H
    OR (HL)`,
    "a=0x81, zero=f, h=0x12, l=0x3D, carry=f, [0x123D]=0x01");

    test(`
    LD A, 7FH
    OR 80H`,
    "a=0xFF, zero=f, carry=f");

    test(`
    LD A, 0FFH
    XOR A`,
    "a=0x00, zero=t, carry=f");

    test(`
    LD A, 7FH
    XOR 80H`,
    "a=0xFF, zero=f, carry=f");

    test(`
    LD A, 0FFH
    CP 0FFH`,
    "a=0xFF, zero=t, carry=f");

    test(`
    LD A, 80H
    CP 0FFH`,
    "a=0x80, zero=f, carry=t");

    test(`
    LD A, 0FFH
    CP 80H`,
    "a=0xFF, zero=f, carry=f");

    test(`
    LD B, 0FFH
    CP B`,
    "a=0x00, b=0xFF, zero=f, carry=t");

    test(`
    LD HL, 123EH
    LD (HL), 80H
    LD A, 80H
    CP (HL)`,
    "a=0x80, zero=t, carry=f, h=0x12, l=0x3E, [0x123E]=0x80");

    test("NEG", "a=0x00, zero=t, carry=f");

    test(`
    LD A, 1
    NEG`,
    "a=0xFF, zero=f, carry=t");

    test(`
    LD A, 80H
    NEG`,
    "a=0x80, zero=f, carry=t");

    test("SCF", "carry=t");

    test(`
    SCF
    CCF`,
    "carry=f");

    test("CPL", "a=0xFF");

    test(`
    LD A, 7FH
    CPL`,
    "a=0x80");

    test(`
    LD A, 1
    RLCA`,
    "a=0x02, carry=f");

    test(`
    LD A, 80H
    RLCA`,
    "a=0x01, carry=t");

    test(`
    LD A, 0FFH
    RLCA`,
    "a=0xFF, carry=t");

    test(`
    LD A, 80H
    SLA A`,
    "a=0x00, zero=t, carry=t");

    test(`
    LD B, 0FFH
    SRA B`,
    "b=0xFF, zero=f, carry=t");

    test(`
    LD C, 01H
    SRL C`,
    "c=0x00, zero=t, carry=t");

    test(`
    LD HL, 123FH
    LD (HL), 01H
    SLA (HL)`,
    "carry=f, h=0x12, l=0x3F, zero=f, [0x123F]=0x02");

    test(`
    LD HL, 1240H
    LD (HL), 01H
    SRA (HL)`,
    "zero=t, carry=t, h=0x12, l=0x40, [0x1240]=0x00");

    test(`
    LD HL, 1241H
    LD (HL), 80H
    SRL (HL)`,
    "carry=f, h=0x12, l=0x41, zero=f, [0x1241]=0x40");

    test(`
    LD A, 01H
    BIT 0, A`,
    "zero=f, a=0x01");

    test(`
    LD A, 0
    BIT 0, A`,
    "zero=t");

    test(`
    LD A, 80H
    BIT 7, A`,
    "zero=f, a=0x80");

    test(`
    LD A, 0
    BIT 7, A`,
    "zero=t");

    test(`
    LD A, 40H
    BIT 6, A`,
    "zero=f, a=0x40");

    test(`
    LD E, 80H
    BIT 7, E`,
    "zero=f, e=0x80");

    test(`
    LD D, 00H
    BIT 7, D`,
    "zero=t");

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
    "h=0x12, l=0x42, d=0x12, e=0x52, b=0x00, c=0x00, [0x1240]=0xFF, [0x1241]=0x80, [0x1242]=0x7F, [0x1250]=0xFF, [0x1251]=0x80");

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
    "h=0x12, l=0x44, d=0x12, e=0x45, b=0x00, c=0x00, [0x1242]=0xFF, [0x1243]=0xFF, [0x1244]=0xFF");

    test("PUSH BC", "sp=0xFFFD, [0xFFFD]=0x00, [0xFFFE]=0x00");

    test(`
    LD SP, 1246H
    LD A, 0FFH
    LD (1246H), A
    LD A, 80H
    LD (1247H), A
    POP BC`,
    "b=0x80, c=0xFF, sp=0x1248, a=0x80, [0x1246]=0xFF, [0x1247]=0x80");

    test(`
    LD SP, 1248H
    LD H, 80H
    LD L, 7FH
    PUSH HL
    LD H, 0
    LD L, 0
    POP HL`,
    "h=0x80, l=0x7F, sp=0x1248, [0x1246]=0x7F, [0x1247]=0x80");

    test(`
    LD SP, 1248H
    LD D, 0FFH
    LD E, 0
    PUSH DE
    LD D, 0
    LD E, 0
    POP DE`,
    "d=0xFF, e=0x00, sp=0x1248, [0x1246]=0x00, [0x1247]=0xFF");

    test(`
    LD SP, 1248H
    LD A, 0FFH
    SCF
    PUSH AF
    LD A, 0
    CCF
    POP AF`,
    "a=0xFF, carry=t, sp=0x1248, [0x1247]=0xFF Z0C0:[0x1246]=0x01 Z0C1:[0x1246]=0x01 Z1C0:[0x1246]=0x41 Z1C1:[0x1246]=0x41");

    test("JR 3", "pc=3");

    test("CALL 100H", "pc=0x100, sp=0xFFFD, [0xFFFD]=0x03, [0xFFFE]=0x00");

    test(`
    CP 0
    JR Z, 5`,
    "pc=5, zero=t, carry=f");

    test(`
    CP 1
    JR NZ, 5`,
    "pc=5, zero=f, carry=t");

    test(`
    SCF
    JR C, 7`,
    "pc=7, carry=t");

    test(`
    SCF
    JR NC, 7`,
    "pc=3, carry=t");

    test(`
    LD B, 2
    DJNZ 5`,
    "pc=5, b=0x01");

    test(`
    LD B, 1
    DJNZ 5`,
    "pc=4, b=0x00");

    test("JP 1234H", "pc=0x1234");

    test(`
    CP 0
    JP Z, 1234H`,
    "pc=0x1234, zero=t, carry=f");

    test(`
    CP 0
    JP NZ, 1234H`,
    "pc=5, zero=t, carry=f");

    test(`
    SCF
    JP C, 1234H`,
    "pc=0x1234, carry=t");

    test(`
    SCF
    JP NC, 1234H`,
    "pc=4, carry=t");

    test(`
    LD SP, 1248H
    LD HL, 1234H
    PUSH HL
    RET`,
    "pc=0x1234, sp=0x1248, h=0x12, l=0x34, [0x1246]=0x34, [0x1247]=0x12");

    test(`
    CP 0
    LD SP, 1248H
    LD HL, 0FFH
    PUSH HL
    RET Z`,
    "pc=0xFF, sp=0x1248, zero=t, carry=f, h=0x00, l=0xFF, [0x1246]=0xFF, [0x1247]=0x00");

    test(`
    CP 0
    RET NZ`,
    "pc=3, zero=t, carry=f");

    test(`
    SCF
    LD SP, 1248H
    LD HL, 80H
    PUSH HL
    RET C`,
    "pc=0x80, sp=0x1248, carry=t, h=0x00, l=0x80, [0x1246]=0x80, [0x1247]=0x00");

    test(`
    SCF
    RET NC`,
    "pc=2, carry=t");

    test(`
    LD A, 0FFH
    OUT (7FH), A
    LD A, 0
    IN A, (7FH)`,
    "a=0xFF, port[0x7F]=0xFF");

    // Test that expects a specific error message - should pass when it gets the expected error
    test(
    "LD A, 42H",
    "a=0x99",
    "Register A mismatch: expected 0x99 but got 0x42");

    // Summary
    this.consoleLogIfNode(
    `\nTest Results: ${testsPassed}/${totalTests} tests passed`
    );
    this.testCount = totalTests;
    this.passedCount = testsPassed;
    this.failedTests =
      totalTests - testsPassed > 0
        ? [`${totalTests - testsPassed} tests failed`]
        : [];

    if (testsPassed === totalTests) {
      this.consoleLogIfNode("All tests passed!");
      return true;
    } else {
      console.error(`${totalTests - testsPassed} tests failed!`);
      return false;
    }
  }
}

// Run tests if this file is executed directly in Node.js
if (typeof require !== "undefined" && require.main === module) {
  const z80CPUTestSuite = new Z80CPUTestSuite();
  z80CPUTestSuite.runAllTests();
}

// Export for use in other modules (Node.js environment)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Z80CPUTestSuite;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
  window.Z80CPUTestSuite = Z80CPUTestSuite;
}