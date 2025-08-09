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
        throw new Error(`Failed to load dependencies in Node.js: ${error.message}`);
      }
    } else {
      // Browser environment - classes should be globally available
      if (typeof Z80CPU !== "undefined") {
        // Global Z80CPU is available
        Z80CPU = Z80CPU;
      } else if (typeof window !== "undefined" && window.Z80CPU) {
        Z80CPU = window.Z80CPU;
      } else {
        throw new Error('Z80CPU class not available in browser environment - ensure z80_cpu_emulator.js is loaded');
      }
      
      if (typeof Z80Assembler !== "undefined") {
        // Global Z80Assembler is available
        Z80Assembler = Z80Assembler;
      } else if (typeof window !== "undefined" && window.Z80Assembler) {
        Z80Assembler = window.Z80Assembler;
      } else {
        throw new Error('Z80Assembler class not available in browser environment - ensure z80_assembler.js is loaded');
      }
    }

    const assembler = new Z80Assembler();
    const cpu = new Z80CPU();
    const memory = new Uint8Array(65536);
    const iomap = new Uint8Array(256); // I/O port map for 256 ports
    let testsPassed = 0;
    let totalTests = 0;
    
    // Capture reference to 'this' for use in nested functions
    const testSuite = this;

    // Parse expectation string with key=value syntax:
    // "pc=2, zero=f, carry=t, sp=0xFFFD"
    // Values: t/f/true/false for booleans, flip for complement, numbers for values
    //
    // NOTE: This test function checks if flags are preserved when not explicitly specified.
    // However, many Z80 instructions legitimately modify flags as part of their operation:
    // - Logical operations (AND, OR, XOR) typically reset the carry flag
    // - Arithmetic operations modify both zero and carry flags
    // - Some instructions like NEG set flags based on the result
    // If a test fails due to unexpected flag changes, the expectation string should
    // specify the correct post-condition flags that the instruction should set.
    function parseExpectations(expectStr) {
      if (!expectStr) return {};

      const expectations = {};
      const pairs = expectStr.split(",").map((s) => s.trim());

      for (const pair of pairs) {
        const [key, value] = pair.split("=").map((s) => s.trim());
        if (!key || !value) continue;

        const lowerKey = key.toLowerCase();
        const lowerValue = value.toLowerCase();

        // Parse different value types
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
    function test(assembly, expectation = "") {
      const flagCombos = [
        { Z: false, C: false },
        { Z: false, C: true },
        { Z: true, C: false },
        { Z: true, C: true },
      ];

      const expected = parseExpectations(expectation);

      flagCombos.forEach((initialFlags) => {
        totalTests++;
        const escapedAssembly = assembly
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
        const testName = `${escapedAssembly} "${expectation}" [Z:${
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
          cpu.reset();
          cpu.set(0x0000, 0xffff);
          cpu.registers.F = { ...initialFlags };
          const initialSP = cpu.registers.SP;

          // Capture initial state for unchanged verification
          const initialRegisters = { ...cpu.registers };
          const initialMemoryChecksum = memory.reduce(
            (sum, byte, i) => sum + byte * (i + 1),
            0
          );

          // Load machine code into memory
          for (let i = 0; i < result.machineCode.length; i++) {
            memory[i] = result.machineCode[i];
          }

          // Update checksum after loading code
          const postLoadMemoryChecksum = memory.reduce(
            (sum, byte, i) => sum + byte * (i + 1),
            0
          );

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
            : result.machineCode.length;
          if (execResult.registers.PC !== expectedPC) {
            throw new Error(
              `PC mismatch: expected 0x${expectedPC.toString(16).toUpperCase()} but got 0x${execResult.registers.PC.toString(16).toUpperCase()} (machine code length: ${result.machineCode.length})`
            );
          }

          // Check SP expectation
          if (expected.hasOwnProperty("sp")) {
            if (execResult.registers.SP !== expected.sp) {
              throw new Error(
                `SP mismatch: expected 0x${expected.sp.toString(16).toUpperCase()} but got 0x${execResult.registers.SP.toString(16).toUpperCase()}`
              );
            }
          } else {
            // SP should be unchanged by default
            if (execResult.registers.SP !== initialSP) {
              throw new Error(
                `SP changed unexpectedly: expected unchanged (0x${initialSP.toString(16).toUpperCase()}) but got 0x${execResult.registers.SP.toString(16).toUpperCase()}`
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
                  `Register ${regName} mismatch: expected 0x${expectedVal.toString(16).padStart(2, '0').toUpperCase()} but got 0x${actual.toString(16).padStart(2, '0').toUpperCase()}`
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

          // Check that unspecified registers are unchanged
          const allRegisters = ["A", "B", "C", "D", "E", "H", "L"];
          for (const reg of allRegisters) {
            const regKey = reg.toLowerCase();
            if (!expected.hasOwnProperty(regKey)) {
              if (execResult.registers[reg] !== initialRegisters[reg]) {
                throw new Error(
                  `Register ${reg}: expected unchanged (${initialRegisters[reg]}), got ${execResult.registers[reg]}`
                );
              }
            }
          }

          // Check that memory outside instruction area is unchanged
          // Calculate memory regions that could be affected
          const affectedRegions = new Set();

          // Add instruction memory region
          for (let i = 0; i < result.machineCode.length; i++) {
            affectedRegions.add(i);
          }

          // Add stack region if SP changed
          if (execResult.registers.SP !== initialSP) {
            const spStart = Math.min(execResult.registers.SP, initialSP);
            const spEnd = Math.max(execResult.registers.SP, initialSP);
            for (let i = spStart; i < spEnd + 2; i++) {
              // +2 for safety
              affectedRegions.add(i);
            }
          }

          // Add memory addresses that might be accessed by instructions
          // Check for memory operations in the assembly
          const assemblyLower = assembly.toLowerCase();
          if (
            assemblyLower.includes("(hl)") ||
            assemblyLower.includes("(bc)") ||
            assemblyLower.includes("(de)")
          ) {
            // Add potential memory access locations - be permissive for now
            for (let i = 0x1000; i <= 0x1010; i++) {
              affectedRegions.add(i);
            }
          }

          // Check memory locations outside affected regions
          for (let addr = 0; addr < Math.min(memory.length, 2000); addr++) {
            // Check first 2KB for performance
            if (!affectedRegions.has(addr)) {
              if (memory[addr] !== 0) {
                // Should be unchanged (was initialized to 0)
                throw new Error(
                  `Memory[${addr}]: expected unchanged (0), got ${memory[addr]}`
                );
              }
            }
          }

          testSuite.consoleLogIfNode(`PASS ${testName}`);
          testsPassed++;
        } catch (error) {
          // Enhanced error reporting with CPU state context
          const failureDetails = [
            `FAIL ${testName}`,
            `Error: ${error.message}`,
            `Assembly: ${assembly.replace(/\n/g, ' | ')}`,
            `Expected: ${expectation}`,
            `Initial flags: Z=${initialFlags.Z ? 1 : 0}, C=${initialFlags.C ? 1 : 0}`
          ];
          
          // Try to get CPU state for error reporting if execution was attempted
          let execResultForReport = execResult;
          if (!execResultForReport) {
            // Try to re-execute to get state for debugging (if assembly succeeded)
            try {
              if (typeof result !== 'undefined' && result.success) {
                memory.fill(0);
                cpu.reset();
                cpu.set(0x0000, 0xffff);
                cpu.registers.F = { ...initialFlags };
                for (let i = 0; i < result.machineCode.length; i++) {
                  memory[i] = result.machineCode[i];
                }
                execResultForReport = cpu.executeSteps(memory, iomap, assembly.split("\n").filter((line) => line.trim()).length);
              }
            } catch (e) {
              // Re-execution failed, leave execResultForReport undefined
            }
          }
          
          // Add CPU state if available
          if (execResultForReport) {
            failureDetails.push(`Final CPU state:`);
            failureDetails.push(`  Registers: A=${execResultForReport.registers.A.toString(16).padStart(2, '0').toUpperCase()}H, B=${execResultForReport.registers.B.toString(16).padStart(2, '0').toUpperCase()}H, C=${execResultForReport.registers.C.toString(16).padStart(2, '0').toUpperCase()}H, D=${execResultForReport.registers.D.toString(16).padStart(2, '0').toUpperCase()}H, E=${execResultForReport.registers.E.toString(16).padStart(2, '0').toUpperCase()}H, H=${execResultForReport.registers.H.toString(16).padStart(2, '0').toUpperCase()}H, L=${execResultForReport.registers.L.toString(16).padStart(2, '0').toUpperCase()}H`);
            failureDetails.push(`  PC=${execResultForReport.registers.PC.toString(16).padStart(4, '0').toUpperCase()}H, SP=${execResultForReport.registers.SP.toString(16).padStart(4, '0').toUpperCase()}H`);
            failureDetails.push(`  Flags: Z=${execResultForReport.registers.F.Z ? 1 : 0}, C=${execResultForReport.registers.F.C ? 1 : 0}`);
            if (execResultForReport.halted) {
              failureDetails.push(`  Status: HALTED`);
            }
          }
          
          console.error(failureDetails.join('\n    '));
        }
      });
    }

    this.consoleLogIfNode("Starting Z80 CPU tests with key=value expectations...\n");

    test("NOP");
    test("HALT", "halted=t");

    test("LD A, 0FFH", "a=0xFF");
    test("LD HL, 0FFFFH", "h=0xFF, l=0xFF");

    test("LD A, 0A5H\nLD (1234H), A\nLD A, 0\nLD A, (1234H)", "a=0xA5");

    test(
      "LD BC, 2000H\nLD A, 42H\nLD (BC), A\nLD A, 0\nLD A, (BC)",
      "a=0x42, b=0x20, c=0x00"
    );
    test(
      "LD DE, 2001H\nLD A, 99H\nLD (DE), A\nLD A, 0\nLD A, (DE)",
      "a=0x99, d=0x20, e=0x01"
    );

    test("LD HL, 3000H\nLD (HL), 7EH\nLD B, (HL)", "b=0x7E, h=0x30, l=0x00");
    test(
      "LD HL, 3001H\nLD B, 12H\nLD (HL), B\nLD A, (HL)",
      "a=0x12, b=0x12, h=0x30, l=0x01"
    );
    test(
      "LD H, 12H\nLD L, 34H\nLD (HL), L\nLD A, (HL)",
      "a=0x34, h=0x12, l=0x34"
    );
    test(
      "LD H, 12H\nLD L, 00H\nLD (HL), H\nLD A, (HL)",
      "a=0x12, h=0x12, l=0x00"
    );

    test("LD A, 99H\nLD E, A\nLD A, E", "a=0x99, e=0x99");
    test("LD A, 12H\nLD C, A\nLD B, C", "a=0x12, b=0x12, c=0x12");
    test("LD A, 55H\nLD H, A\nLD B, H", "a=0x55, h=0x55, b=0x55");
    test("LD A, 77H\nLD L, A\nLD A, L", "a=0x77, l=0x77");
    test("LD A, 33H\nLD D, A\nLD A, D", "a=0x33, d=0x33");
    test("LD A, 44H\nLD B, A\nLD A, B", "a=0x44, b=0x44");
    test("LD C, 88H\nLD A, C", "a=0x88, c=0x88");
    test("LD A, 11H\nLD H, A\nLD A, H", "a=0x11, h=0x11");

    test(
      "LD A, 77H\nSCF\nEX AF, AF'\nXOR A\nCCF\nEX AF, AF'",
      "a=0x77, carry=t"
    );
    test(
      "LD D, 0FFH\nLD E, 0\nLD H, 0\nLD L, 0FFH\nEX DE, HL",
      "d=0x00, e=0xFF, h=0xFF, l=0x00"
    );

    test("LD A, 1\nINC A", "a=0x02, zero=f");
    test("LD A, 0FFH\nINC A", "a=0x00, zero=t");
    test("LD A, 7FH\nINC A", "a=0x80, zero=f");
    test("LD B, 1\nINC B", "b=0x02, zero=f");
    test("LD B, 0FFH\nINC B", "b=0x00, zero=t");
    test("LD C, 0FEH\nINC C", "c=0xFF, zero=f");
    test("INC D", "d=0x01, zero=f");
    test("LD E, 7FH\nINC E", "e=0x80, zero=f");
    test("LD H, 0FFH\nINC H", "h=0x00, zero=t");
    test("LD L, 50H\nINC L", "l=0x51, zero=f");

    test("LD A, 1\nDEC A", "a=0x00, zero=t");
    test("DEC A", "a=0xFF, zero=f");
    test("LD A, 80H\nDEC A", "a=0x7F, zero=f");
    test("LD B, 1\nDEC B", "b=0x00, zero=t");
    test("DEC B", "b=0xFF, zero=f");
    test("LD C, 80H\nDEC C", "c=0x7F, zero=f");
    test("LD D, 2\nDEC D", "d=0x01, zero=f");
    test("LD E, 1\nDEC E", "e=0x00, zero=t");
    test("LD H, 81H\nDEC H", "h=0x80, zero=f");
    test("DEC L", "l=0xFF, zero=f");

    test(
      "LD HL, 4000H\nINC (HL)\nLD A, (HL)",
      "a=0x01, zero=f, h=0x40, l=0x00"
    );
    test(
      "LD HL, 4001H\nDEC (HL)\nLD A, (HL)",
      "a=0xFF, zero=f, h=0x40, l=0x01"
    );

    test("LD HL, 1\nINC HL", "h=0x00, l=0x02");
    test("LD HL, 0FFFFH\nINC HL", "h=0x00, l=0x00");
    test("LD HL, 00FFH\nINC HL", "h=0x01, l=0x00");
    test("LD BC, 1\nINC BC", "b=0x00, c=0x02");
    test("LD BC, 0FFFFH\nINC BC", "b=0x00, c=0x00");
    test("LD DE, 00FFH\nINC DE", "d=0x01, e=0x00");
    test("LD SP, 1000H\nINC SP", "sp=0x1001");

    test("LD HL, 1\nDEC HL", "h=0x00, l=0x00");
    test("LD HL, 0\nDEC HL", "h=0xFF, l=0xFF");
    test("LD HL, 100H\nDEC HL", "h=0x00, l=0xFF");
    test("LD BC, 1\nDEC BC", "b=0x00, c=0x00");
    test("LD BC, 0\nDEC BC", "b=0xFF, c=0xFF");
    test("LD DE, 200H\nDEC DE", "d=0x01, e=0xFF");
    test("LD SP, 2000H\nDEC SP", "sp=0x1FFF");

    test(
      "LD HL, 0FFFFH\nLD BC, 1\nADD HL, BC",
      "h=0x00, l=0x00, b=0x00, c=0x01, carry=t"
    );
    test(
      "LD HL, 8000H\nLD DE, 8000H\nADD HL, DE",
      "h=0x00, l=0x00, d=0x80, e=0x00, carry=t"
    );
    test("LD HL, 8000H\nADD HL, HL", "h=0x00, l=0x00, carry=t");
    test(
      "LD HL, 1\nLD SP, 0FFFFH\nADD HL, SP",
      "h=0x00, l=0x00, sp=0xFFFF, carry=t"
    );

    test("LD A, 5\nLD B, 3\nADD A, B", "a=0x08, b=0x03, zero=f, carry=f");
    test("LD A, 0FFH\nLD B, 1\nADD A, B", "a=0x00, b=0x01, zero=t, carry=t");
    test("LD A, 80H\nLD B, 80H\nADD A, B", "a=0x00, b=0x80, zero=t, carry=t");
    test("LD A, 80H\nADD A, A", "a=0x00, zero=t, carry=t");
    test("LD A, 10H\nADD A, 0F0H", "a=0x00, zero=t, carry=t");

    test(
      "LD A, 80H\nLD H, 80H\nSCF\nADC A, H",
      "a=0x01, carry=t, zero=f, h=0x80"
    );
    test("SCF\nADC A, 0", "a=0x01, carry=f, zero=f");

    test("LD A, 5\nLD B, 3\nSUB B", "a=0x02, b=0x03, zero=f, carry=f");
    test("LD A, 3\nLD B, 5\nSUB B", "a=0xFE, b=0x05, zero=f, carry=t");
    test("LD A, 5\nLD B, 5\nSUB B", "a=0x00, b=0x05, zero=t, carry=f");
    test("LD A, 20H\nLD H, 1\nSUB H", "a=0x1F, h=0x01, carry=f, zero=f");
    test("LD A, 10H\nSUB 20H", "a=0xF0, carry=t, zero=f");
    test("LD A, 7\nSUB A", "a=0x00, zero=t, carry=f");

    test("LD A, 55H\nLD B, 0AAH\nAND B", "a=0x00, b=0xAA, zero=t, carry=f");
    test("LD A, 0FFH\nLD B, 55H\nAND B", "a=0x55, b=0x55, zero=f, carry=f");
    test("LD A, 3CH\nLD B, 66H\nAND B", "a=0x24, b=0x66, zero=f, carry=f");
    test("LD A, 0FFH\nAND A", "a=0xFF, zero=f, carry=f");
    test(
      "LD HL, 5000H\nLD (HL), 0FH\nLD A, 0F0H\nAND (HL)",
      "a=0x00, zero=t, h=0x50, l=0x00, carry=f"
    );
    test("LD A, 55H\nAND 0FH", "a=0x05, zero=f, carry=f");

    test("LD A, 55H\nLD B, 0AAH\nOR B", "a=0xFF, b=0xAA, zero=f, carry=f");
    test("LD B, 0\nOR B", "a=0x00, b=0x00, zero=t, carry=f");
    test("LD A, 80H\nOR A", "a=0x80, zero=f, carry=f");
    test(
      "LD HL, 5001H\nLD (HL), 01H\nLD A, 80H\nOR (HL)",
      "a=0x81, zero=f, h=0x50, l=0x01, carry=f"
    );
    test("LD A, 01H\nOR 80H", "a=0x81, zero=f, carry=f");

    test("LD A, 0FFH\nXOR A", "a=0x00, zero=t, carry=f");
    test("LD A, 55H\nXOR 0AAH", "a=0xFF, zero=f, carry=f");

    test("LD A, 5\nCP 5", "a=0x05, zero=t, carry=f");
    test("LD A, 3\nCP 5", "a=0x03, zero=f, carry=t");
    test("LD A, 7\nCP 5", "a=0x07, zero=f, carry=f");
    test("LD B, 1\nCP B", "a=0x00, b=0x01, zero=f, carry=t");
    test(
      "LD HL, 6000H\nLD (HL), 42H\nLD A, 42H\nCP (HL)",
      "a=0x42, zero=t, carry=f, h=0x60, l=0x00"
    );

    test("NEG", "a=0x00, zero=t, carry=f");
    test("LD A, 1\nNEG", "a=0xFF, zero=f, carry=t");
    test("LD A, 80H\nNEG", "a=0x80, zero=f, carry=t");

    test("SCF", "carry=t");
    test("SCF\nCCF", "carry=f");
    test("CPL", "a=0xFF");
    test("LD A, 55H\nCPL", "a=0xAA");

    test("LD A, 1\nRLCA", "a=0x02, carry=f");
    test("LD A, 80H\nRLCA", "a=0x01, carry=t");
    test("LD A, 0C3H\nRLCA", "a=0x87, carry=t");

    test("LD A, 80H\nSLA A", "a=0x00, zero=t, carry=t");
    test("LD B, 81H\nSRA B", "b=0xC0, zero=f, carry=t");
    test("LD C, 01H\nSRL C", "c=0x00, zero=t, carry=t");
    test(
      "LD HL, 7000H\nLD (HL), 01H\nSLA (HL)\nLD A, (HL)",
      "a=0x02, carry=f, h=0x70, l=0x00, zero=f"
    );
    test(
      "LD HL, 7001H\nLD (HL), 01H\nSRA (HL)\nLD A, (HL)",
      "a=0x00, zero=t, carry=t, h=0x70, l=0x01"
    );
    test(
      "LD HL, 7002H\nLD (HL), 80H\nSRL (HL)\nLD A, (HL)",
      "a=0x40, carry=f, h=0x70, l=0x02, zero=f"
    );

    test("LD A, 01H\nBIT 0, A", "zero=f, a=0x01");
    test("LD A, 0\nBIT 0, A", "zero=t");
    test("LD A, 80H\nBIT 7, A", "zero=f, a=0x80");
    test("LD A, 0\nBIT 7, A", "zero=t");
    test("LD A, 40H\nBIT 6, A", "zero=f, a=0x40");
    test("LD E, 80H\nBIT 7, E", "zero=f, e=0x80");
    test("LD D, 00H\nBIT 7, D", "zero=t");

    test(
      "LD HL, 2000H\nLD (HL), 11H\nINC HL\nLD (HL), 22H\nINC HL\nLD (HL), 33H\nLD DE, 3000H\nLD HL, 2000H\nLD BC, 3\nLDIR\nLD A, (3002H)",
      "a=0x33, h=0x20, l=0x03, d=0x30, e=0x03, b=0x00, c=0x00"
    );

    test("PUSH BC", "sp=0xFFFD");
    test(
      "LD SP, 2000H\nLD A, 34H\nLD (2000H), A\nLD A, 12H\nLD (2001H), A\nPOP BC",
      "b=0x12, c=0x34, sp=0x2002, a=0x12"
    );
    test(
      "LD SP, 2000H\nLD H, 12H\nLD L, 34H\nPUSH HL\nLD H, 0\nLD L, 0\nPOP HL",
      "h=0x12, l=0x34, sp=0x2000"
    );
    test(
      "LD SP, 2000H\nLD D, 56H\nLD E, 78H\nPUSH DE\nLD D, 0\nLD E, 0\nPOP DE",
      "d=0x56, e=0x78, sp=0x2000"
    );
    test(
      "LD SP, 2000H\nLD A, 9BH\nSCF\nPUSH AF\nLD A, 0\nCCF\nPOP AF",
      "a=0x9B, carry=t, sp=0x2000"
    );

    test("JR 3", "pc=3");
    test("CALL 100H", "pc=0x100, sp=0xFFFD");

    test("CP 0\nJR Z, 5", "pc=5, zero=t, carry=f");
    test("CP 1\nJR NZ, 5", "pc=5, zero=f, carry=t");
    test("SCF\nJR C, 7", "pc=7, carry=t");
    test("SCF\nJR NC, 7", "pc=3, carry=t");
    test("LD B, 2\nDJNZ 5", "pc=5, b=0x01");
    test("LD B, 1\nDJNZ 5", "pc=4, b=0x00");

    test("JP 1234H", "pc=0x1234");
    test("CP 0\nJP Z, 1234H", "pc=0x1234, zero=t, carry=f");
    test("CP 0\nJP NZ, 1234H", "pc=5, zero=t, carry=f");
    test("SCF\nJP C, 1234H", "pc=0x1234, carry=t");
    test("SCF\nJP NC, 1234H", "pc=4, carry=t");

    test(
      "LD SP, 1000H\nLD HL, 1234H\nPUSH HL\nRET",
      "pc=0x1234, sp=0x1000, h=0x12, l=0x34"
    );
    test(
      "CP 0\nLD SP, 1000H\nLD HL, 4242H\nPUSH HL\nRET Z",
      "pc=0x4242, sp=0x1000, zero=t, carry=f, h=0x42, l=0x42"
    );
    test("CP 0\nRET NZ", "pc=3, zero=t, carry=f");
    test(
      "SCF\nLD SP, 1000H\nLD HL, 7777H\nPUSH HL\nRET C",
      "pc=0x7777, sp=0x1000, carry=t, h=0x77, l=0x77"
    );
    test("SCF\nRET NC", "pc=2, carry=t");

    test("LD A, 55H\nOUT (7FH), A\nLD A, 0\nIN A, (7FH)", "a=0x55");

    // Summary
    this.consoleLogIfNode(`\nTest Results: ${testsPassed}/${totalTests} tests passed`);
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
