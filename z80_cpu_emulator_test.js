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
    // Load dependencies using inherited method
    const { Z80CPU, Z80Assembler, TestFramework } = this.loadDependencies([
      "Z80CPU", 
      "Z80Assembler", 
      "TestFramework"
    ]);

    const assembler = new Z80Assembler();
    const cpu = new Z80CPU();
    const memory = new Uint8Array(65536);
    const iomap = new Uint8Array(256);

    // Capture reference to 'this' for use in nested functions
    const TestClass = this;

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

      flagCombos.forEach((initialFlags, flagComboIndex) => {

        // Parse expectations with flag combination index for Z0C0 syntax support
        const expected = parseExpectations(expectations, flagComboIndex);

        const displayName = testName || assembly.trim();
        const finalTestName = `${displayName} "${expectations}" [Z:${
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

          // Capture complete initial state for comprehensive change verification
          const initialState = {
            registers: { ...cpu.registers, F: { ...cpu.registers.F } },
            shadowRegisters: cpu.shadowRegisters ? { 
              A: cpu.shadowRegisters.A, 
              F: { ...cpu.shadowRegisters.F } 
            } : null,
            halted: cpu.halted,
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

          // Capture memory state after loading code (to ignore code loading changes)
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
          const allRegisters = ["A", "B", "C", "D", "E", "H", "L", "SP"];
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
                  `Register ${reg}: unexpected change from 0x${formatHex2(
                    initialState.registers[reg]
                  )} to 0x${formatHex2(execResult.registers[reg])}`
                );
              }
            }
          }

          // 2a. Check for unexpected shadow register changes
          if (execResult.shadowRegisters) {
            // Check shadow A register
            if (execResult.shadowRegisters.A !== initialState.shadowRegisters?.A) {
              throw new Error(
                `Shadow register A: unexpected change from 0x${formatHex2(
                  initialState.shadowRegisters?.A || 0
                )} to 0x${formatHex2(execResult.shadowRegisters.A)}`
              );
            }
            
            // Check shadow flags
            if (execResult.shadowRegisters.F && initialState.shadowRegisters?.F) {
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
            }
          }

          // 2b. Check for unexpected halted state changes
          if (!expected.hasOwnProperty("halted")) {
            if (execResult.halted !== initialState.halted) {
              throw new Error(
                `Halted state: unexpected change from ${initialState.halted} to ${execResult.halted}`
              );
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
          for (let addr = 0; addr < memory.length; addr++) {
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
                  `[0x${formatHex4(
                    change.address
                  )}]: 0x${formatHex2(
                    change.initial
                  )}→0x${formatHex2(change.final)}`
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
                  `Port[0x${formatHex2(
                    change.port
                  )}]: 0x${formatHex2(
                    change.initial
                  )}→0x${formatHex2(change.final)}`
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
      const instructionLines = assembly
        .split("\n")
        .filter((line) => line.trim()).length;
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

    // Load and execute test cases
    if (typeof require !== "undefined") {
      // Node.js environment - load test cases as a function
      const runTestCases = require("./z80_cpu_emulator_tests.js");
      runTestCases(test, test_expect_error);
    } else {
      // Browser environment - test cases should be globally available
      if (typeof runZ80CPUEmulatorTestClass === "function") {
        runZ80CPUEmulatorTestClass(test, test_expect_error);
      } else {
        throw new Error(
          "Test cases not available in browser environment - ensure z80_cpu_emulator_tests.js is loaded"
        );
      }
    }

    // Complete tests using inherited method
    return this.completeTests();
  }
}

// Run tests if this file is executed directly in Node.js
if (typeof require !== "undefined" && require.main === module) {
  const z80CPUTestClass = new Z80CPUEmulatorTestClass();
  z80CPUTestClass.runAllTests();
}

// Export for use in other modules (Node.js environment)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Z80CPUEmulatorTestClass;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
  window.Z80CPUEmulatorTestClass = Z80CPUEmulatorTestClass;
}
