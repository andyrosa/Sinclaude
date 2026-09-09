// Z80 CPU Emulator Test Suite
//
// OVERVIEW:
// This test suite validates Z80 CPU instruction execution with STRICT verification:
// only explicitly expected changes are allowed - any unexpected changes will fail the test.
//
// EXPECTATION SYNTAX: "key1=value1, key2=value2, ..."
//
// REGISTERS & FLAGS:
//   "a=0xFF, b=0x80, h=0x12, l=0x34, sp=0xFFFD, pc=0x1234"
//   "zero=t, carry=f" or "zero=true, carry=false"
//   "zero=flip" - expect flag to change from initial state
//   - Values can be hex (0xFF) or decimal (255)
//
// MEMORY & I/O:
//   "[0x1234]=0xFF, [0x1235]=0x80" - memory expectations
//   "port[0x7F]=0xFF" - I/O port expectations
//
// OTHER STATE:
//   "halted=t" - CPU halted state
//
// FLAG-SPECIFIC EXPECTATIONS:
//   "base Z0C0:flag-specific Z0C1:flag-specific Z1C0:flag-specific Z1C1:flag-specific"
//   - Z0C0/Z0C1/Z1C0/Z1C1 = Zero flag false/true, Carry flag false/true combinations
//   - Each test runs 4 times with different initial flag states
//   - Essential for instructions like PUSH AF where flag register values affect results
//
// AUTOMATIC EXCEPTIONS (allowed without specification):
//   1. Program Counter (PC): defaults to machine code length if not specified
//   2. Program Memory: memory locations where assembled program is loaded
//
// EXAMPLE:
//   test("LD A, 0FFH\nLD (1234H), A", "a=0xFF, [0x1234]=0xFF")
//   - Expects register A to be 0xFF and memory location 0x1234 to contain 0xFF
//   - All other registers, memory locations, and flags must remain unchanged

class Z80CPUEmulatorTestClass extends TestFramework {
  constructor() {
    super("Z80 CPU Emulator");
  }

  runAllTests() {
    const assembler = new Z80Assembler();
    const cpu = new Z80CPU();
    const memory = new Uint8Array(65536);
    const iomap = new Uint8Array(256);
    // Snapshots taken before each run; reused so 740 runs do not allocate 64KB each
    const memorySnapshot = new Uint8Array(memory.length);
    const iomapSnapshot = new Uint8Array(iomap.length);

    const BYTE_REGISTERS = ["A", "B", "C", "D", "E", "H", "L"];
    const CHECKED_REGISTERS = [...BYTE_REGISTERS, "SP"];

    // Flag-specific expectation sections, one pattern per Z/C combination in flagCombos order
    const FLAG_COMBO_NAMES = ["Z0C0", "Z0C1", "Z1C0", "Z1C1"];
    const FLAG_COMBO_PATTERNS = FLAG_COMBO_NAMES.map(
      (name) => new RegExp(`\\b${name}:([^Z]*?)(?=\\s*Z[01]C[01]:|$)`)
    );

    // Capture reference to 'this' for use in nested functions
    const TestClass = this;

    // Expectation values are hex with a 0x prefix, otherwise decimal
    function parseNumberLiteral(text) {
      return /^0x/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
    }

    // One instruction executes per non-blank source line
    function countInstructionLines(assembly) {
      return assembly.split("\n").filter((line) => line.trim()).length;
    }

    // Compare a byte array against its snapshot and throw listing the first
    // few differences outside allowedIndexes
    function assertNoUnexpectedChanges(current, initial, allowedIndexes, label, formatIndex, maxShown) {
      const unexpectedChanges = [];
      for (let index = 0; index < current.length; index++) {
        if (current[index] !== initial[index] && !allowedIndexes.has(index)) {
          unexpectedChanges.push(
            `${formatIndex(index)}: 0x${formatHex2(initial[index])}→0x${formatHex2(current[index])}`
          );
        }
      }

      if (unexpectedChanges.length > 0) {
        const moreText =
          unexpectedChanges.length > maxShown
            ? ` and ${unexpectedChanges.length - maxShown} more`
            : "";
        throw new Error(
          `Unexpected ${label} changes: ${unexpectedChanges.slice(0, maxShown).join(", ")}${moreText}`
        );
      }
    }

    function parseExpectations(expectStr, flagComboIndex = 0) {
      if (!expectStr) return {};

      const expectations = {};

      // Split by flag-specific sections first
      // Format: "base expectations Z0C0:flag-specific Z0C1:flag-specific Z1C0:flag-specific Z1C1:flag-specific"

      // Split the expectation string by flag combo patterns
      let baseExpectations = expectStr;
      let flagSpecificExpectations = "";

      // Extract the current flag combo's expectations
      const flagMatch = expectStr.match(FLAG_COMBO_PATTERNS[flagComboIndex]);

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
          const address = parseNumberLiteral(key.slice(1, -1)); // Remove brackets

          if (!isNaN(address)) {
            if (!expectations.memory) expectations.memory = {};

            expectations.memory[address] = parseNumberLiteral(value);
            continue;
          }
        }

        // Check for I/O port expectation syntax: port[0x7F] or port[127]
        if (key.toLowerCase().startsWith("port[") && key.endsWith("]")) {
          const port = parseNumberLiteral(key.slice(5, -1)); // Remove 'port[' and ']'

          if (!isNaN(port) && port >= 0 && port <= 255) {
            if (!expectations.ioports) expectations.ioports = {};

            // I/O ports are never affected by flags, so no flag-specific syntax needed
            expectations.ioports[port] = parseNumberLiteral(value);
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
        } else if (!isNaN(value)) {
          expectations[lowerKey] = parseNumberLiteral(value);
        } else {
          expectations[lowerKey] = value; // String value
        }
      }

      return expectations;
    }

    // Main test helper function - should only be called by test() and test_expect_error()
    function test_helper(
      assembly,
      expectations = "",
      testName = null,
      expectedError = null
    ) {
      const flagCombos = [
        { Z: false, C: false },
        { Z: false, C: true },
        { Z: true, C: false },
        { Z: true, C: true },
      ];

      // The source does not depend on the initial flags, so assemble once for all four runs
      const result = assembler.assemble(assembly);
      const machineCodeLength = result.success
        ? result.instructionDetails.reduce(
            (total, instruction) => total + instruction.opcodes.length,
            0
          )
        : 0;
      const instructionCount = countInstructionLines(assembly);

      flagCombos.forEach((initialFlags, flagComboIndex) => {

        // Parse expectations with flag combination index for Z0C0 syntax support
        const expected = parseExpectations(expectations, flagComboIndex);

        const displayName = testName || assembly.trim();
        const finalTestName = `${displayName} "${expectations}" [Z:${
          initialFlags.Z ? 1 : 0
        } C:${initialFlags.C ? 1 : 0}]`;

        let execResult; // Declare outside try block for error reporting

        try {
          if (!result.success) {
            throw new Error(`Assembly failed: ${result.errors[0].message}`);
          }

          // Reset and setup
          memory.fill(0);
          iomap.fill(0);
          cpu.reset();
          cpu.set(0x0000, 0xffff);
          cpu.registers.F = { ...initialFlags };

          // Capture complete initial state for comprehensive change verification
          iomapSnapshot.set(iomap);
          const initialState = {
            registers: { ...cpu.registers, F: { ...cpu.registers.F } },
            shadowRegisters: {
              A: cpu.shadowRegisters.A,
              F: { ...cpu.shadowRegisters.F }
            },
            halted: cpu.halted,
            iomap: iomapSnapshot,
          };

          // Load machine code into memory
          Z80Assembler.loadOpcodesIntoMemory(memory, result.instructionDetails);

          // Capture memory state after loading code (to ignore code loading changes)
          memorySnapshot.set(memory);
          initialState.memory = memorySnapshot;

          // Execute - run one step per instruction line
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
              `PC mismatch: expected 0x${formatHex4(
                expectedPC
              )} but got 0x${formatHex4(
                execResult.registers.PC
              )} (machine code length: ${machineCodeLength})`
            );
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
                  `Memory[0x${formatHex4(
                    addr
                  )}]: expected 0x${formatHex2(
                    expectedValue
                  )}, got 0x${formatHex2(actualValue)}`
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
                  `Port[0x${formatHex2(
                    portNum
                  )}]: expected 0x${formatHex2(
                    expectedValue
                  )}, got 0x${formatHex2(actualValue)}`
                );
              }
            }
          }

          // 1. Check explicit register expectations first
          for (const reg of CHECKED_REGISTERS) {
            const regKey = reg.toLowerCase();
            if (expected.hasOwnProperty(regKey)) {
              if (execResult.registers[reg] !== expected[regKey]) {
                throw new Error(
                  `Register ${reg}: expected 0x${formatHex2(
                    expected[regKey]
                  )}, got 0x${formatHex2(execResult.registers[reg])}`
                );
              }
            }
          }

          // 2. Check unexpected register changes (only for registers not explicitly expected)
          for (const reg of CHECKED_REGISTERS) {
            const regKey = reg.toLowerCase();
            if (!expected.hasOwnProperty(regKey)) {
              if (execResult.registers[reg] !== initialState.registers[reg]) {
                throw new Error(
                  `Register ${reg}: unexpected change from 0x${formatHex2(
                    initialState.registers[reg]
                  )} to 0x${formatHex2(execResult.registers[reg])}`
                );
              }
            }
          }

          // 2a. Check for unexpected shadow register changes
          if (execResult.shadowRegisters.A !== initialState.shadowRegisters.A) {
            throw new Error(
              `Shadow register A: unexpected change from 0x${formatHex2(
                initialState.shadowRegisters.A
              )} to 0x${formatHex2(execResult.shadowRegisters.A)}`
            );
          }
          if (execResult.shadowRegisters.F.Z !== initialState.shadowRegisters.F.Z) {
            throw new Error(
              `Shadow flag Z: unexpected change from ${initialState.shadowRegisters.F.Z} to ${execResult.shadowRegisters.F.Z}`
            );
          }
          if (execResult.shadowRegisters.F.C !== initialState.shadowRegisters.F.C) {
            throw new Error(
              `Shadow flag C: unexpected change from ${initialState.shadowRegisters.F.C} to ${execResult.shadowRegisters.F.C}`
            );
          }

          // 2b. Check for unexpected halted state changes
          if (!expected.hasOwnProperty("halted")) {
            if (execResult.halted !== initialState.halted) {
              throw new Error(
                `Halted state: unexpected change from ${initialState.halted} to ${execResult.halted}`
              );
            }
          }

          // 3. Memory and I/O may change only where the expectations say so
          const allowedMemoryChangesSet = new Set(
            expected.hasOwnProperty("memory")
              ? Object.keys(expected.memory).map(Number)
              : []
          );
          assertNoUnexpectedChanges(
            memory,
            initialState.memory,
            allowedMemoryChangesSet,
            "memory",
            (address) => `[0x${formatHex4(address)}]`,
            5
          );

          const allowedIOChangesSet = new Set(
            expected.hasOwnProperty("ioports")
              ? Object.keys(expected.ioports).map(Number)
              : []
          );
          assertNoUnexpectedChanges(
            iomap,
            initialState.iomap,
            allowedIOChangesSet,
            "I/O",
            (port) => `Port[0x${formatHex2(port)}]`,
            3
          );

          // Check if we expected an error but the test passed
          if (expectedError !== null) {
            TestClass.assert(false, finalTestName, `Expected error: "${expectedError}" but test passed successfully`);
            return;
          }

          TestClass.assert(true, finalTestName);
        } catch (error) {
          // Check if this is an expected error
          if (expectedError !== null) {
            if (error.message === expectedError) {
              TestClass.assert(true, finalTestName, `(Expected error: "${expectedError}")`);
              return; // Don't process as a failure
            } else {
              // Expected an error but got a different one
              const failureMsg = `Expected error: "${expectedError}", Actual error: "${error.message}"`;
              TestClass.assert(false, finalTestName, failureMsg);
              return;
            }
          }

          // Enhanced error reporting with CPU state context
          const failureDetails = [
            `FAIL ${finalTestName}`,
            `Error: ${error.message}`,
            `Assembly: ${assembly.replace(/\n/g, " | ")}`,
            `Expected: ${expectations}`,
            `Initial flags: Z=${initialFlags.Z ? 1 : 0}, C=${
              initialFlags.C ? 1 : 0
            }`,
          ];

          // Add CPU state if execution was attempted
          if (execResult) {
            const finalRegisters = execResult.registers;
            failureDetails.push(`Final CPU state:`);
            failureDetails.push(
              `  Registers: ${BYTE_REGISTERS.map(
                (name) => `${name}=${formatHex2(finalRegisters[name])}H`
              ).join(", ")}`
            );
            failureDetails.push(
              `  PC=${formatHex4(finalRegisters.PC)}H, SP=${formatHex4(finalRegisters.SP)}H`
            );
            failureDetails.push(
              `  Flags: Z=${finalRegisters.F.Z ? 1 : 0}, C=${finalRegisters.F.C ? 1 : 0}`
            );
            if (execResult.halted) {
              failureDetails.push(`  Status: HALTED`);
            }
          }

          // Use assert to handle both logging and tracking
          const detailsForAssert = `${error.message} | Assembly: ${assembly.replace(/\n/g, " | ")} | Expected: ${expectations}`;
          TestClass.assert(false, finalTestName, detailsForAssert);
          
          // Still show detailed failure info for debugging
          console.error(failureDetails.join("\n    "));
        }
      });
    }

    // Test function with optional test name
    function test(assembly, expectations = "", testName = null) {
      // Check if test name is required (more than one instruction line)
      const instructionLines = countInstructionLines(assembly);
      if (instructionLines > 1 && !testName) {
        // Log failure for missing test name
        const errorMsg = `Test name is required for multi-instruction tests. Assembly has ${instructionLines} lines:\n${assembly}`;
        TestClass.assert(false, "MISSING_TEST_NAME", errorMsg);
        return;
      }

      test_helper(assembly, expectations, testName, null);
    }

    // Test function for expected errors
    function test_expect_error(assembly, expectedError) {
      test_helper(assembly, "", null, expectedError);
    }

    consoleLogIfNode("Starting Z80 CPU tests with key=value expectations...\n");

    runZ80CPUEmulatorTestClass(test, test_expect_error);

    // Complete tests using inherited method
    return this.completeTests();
  }
}

// Export for use in other modules (Node.js environment)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Z80CPUEmulatorTestClass;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
  window.Z80CPUEmulatorTestClass = Z80CPUEmulatorTestClass;
}
