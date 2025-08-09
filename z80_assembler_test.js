/**
 * Comprehensive Test Suite for Z80 Assembler Grammar Specification
 * Tests every feature defined in the EBNF grammar (lines 4-75 in assembler.js)
 */

// Import the assembler (adjust path if needed) - only in Node.js environment

class Z80AssemblerTestSuite {
  constructor() {
    // In browser environment, Z80Assembler is passed as parameter or available globally
    this.assembler = null;
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

  // Test runner utilities
  assert(condition, testName, details = "") {
    this.testCount++;
    if (condition) {
      this.passedCount++;
      this.consoleLogIfNode(`PASS ${testName}`);
    } else {
      this.failedTests.push({ name: testName, details });
      console.error(`FAIL ${testName} - ${details}`);
    }
  }

  assertAssemblySuccess(code, expectedBytes) {
    const result = this.assembler.assemble(code);
    if (result.success) {
      if (!this.arraysEqual(result.machineCode, expectedBytes)) {
        this.assert(
          false,
          code,
          `Expected bytes: [${expectedBytes}], got: [${result.machineCode}]`
        );
      } else {
        this.assert(true, code);
      }
    } else {
      this.assert(
        false,
        code,
        `Assembly failed: ${result.errors.map((e) => e.message).join(", ")}`
      );
    }
    return result;
  }

  assertAssemblyError(code, expectedErrorPattern) {
    const result = this.assembler.assemble(code);
    if (!result.success) {
      const errorMessages = result.errors.map((e) => e.message).join(" ");
      const hasExpectedError = errorMessages.includes(expectedErrorPattern);
      this.assert(
        hasExpectedError,
        expectedErrorPattern,
        `Expected error pattern "${expectedErrorPattern}" not found in: ${errorMessages}`
      );
    } else {
      this.assert(
        false,
        expectedErrorPattern,
        "Expected assembly to fail but it succeeded"
      );
    }
    return result;
  }

  arraysEqual(a, b) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((val, i) => val === b[i])
    );
  }

  runAllTests() {
    // Load dependencies - handle both Node.js and browser environments
    let Z80Assembler;
    
    if (typeof require !== "undefined") {
      // Node.js environment
      try {
        Z80Assembler = require("./z80_assembler.js");
      } catch (error) {
        throw new Error(`Failed to load dependencies in Node.js: ${error.message}`);
      }
    } else {
      // Browser environment - classes should be globally available
      if (typeof Z80Assembler !== "undefined") {
        // Global Z80Assembler is available
        Z80Assembler = Z80Assembler;
      } else if (typeof window !== "undefined" && window.Z80Assembler) {
        Z80Assembler = window.Z80Assembler;
      } else {
        throw new Error('Z80Assembler class not available in browser environment - ensure z80_assembler.js is loaded');
      }
    }

    // Always create a fresh assembler instance
    this.assembler = new Z80Assembler();
    this.testLineParsingAndComments();
    this.testLabelsAndConstants();
    this.testDirectives();
    this.testInstructions();
    this.testRegistersAndMemoryReferences();
    this.testExpressionEvaluation();
    this.testNumberFormats();
    this.testStringAndCharacterLiterals();
    this.testFunctionCalls();
    this.testErrorHandling();
    this.testComplexPrograms();
    this.testComprehensiveInstructions();
    this.testLineAddresses();
    this.testBranchRange();

    this.printResults();
  }

  // Test 13: Line addresses functionality
  testLineAddresses() {
    this.consoleLogIfNode("\nTesting Line Addresses");

    // Test that assembler returns line addresses
    const simpleProgram = `; Comment
NOP
LD A, 42
HALT`;
    
    const result1 = this.assembler.assemble(simpleProgram);
    this.assert(result1.success, "Simple program assembles successfully");
    this.assert(Array.isArray(result1.lineAddresses), "lineAddresses is an array");
    this.assert(result1.lineAddresses.length === 4, "lineAddresses has correct length");
    this.assert(result1.lineAddresses[0] === 0, "Comment line has address 0");
    this.assert(result1.lineAddresses[1] === 0, "NOP line has address 0");
    this.assert(result1.lineAddresses[2] === 1, "LD A, 42 line has address 1");
    this.assert(result1.lineAddresses[3] === 3, "HALT line has address 3");

    // Test with ORG directive
    const orgProgram = `; Header
ORG $8000
NOP
HALT`;
    
    const result2 = this.assembler.assemble(orgProgram);
    this.assert(result2.success, "ORG program assembles successfully");
    this.assert(result2.lineAddresses[0] === 0, "Header comment before ORG has address 0");
    this.assert(result2.lineAddresses[1] === 32768, "ORG line shows new address");
    this.assert(result2.lineAddresses[2] === 32768, "First instruction after ORG");
    this.assert(result2.lineAddresses[3] === 32769, "Second instruction incremented");

    // Test with data directives
    const dataProgram = `NOP
DB "Hi"
DEFW $1234
HALT`;
    
    const result3 = this.assembler.assemble(dataProgram);
    this.assert(result3.success, "Data program assembles successfully");
    this.assert(result3.lineAddresses[0] === 0, "NOP at address 0");
    this.assert(result3.lineAddresses[1] === 1, "DB at address 1");
    this.assert(result3.lineAddresses[2] === 3, "DEFW at address 3 (after 2-byte string)");
    this.assert(result3.lineAddresses[3] === 5, "HALT at address 5 (after 2-byte word)");

    // Test with labels (labels don't generate code but are at current address)
    const labelProgram = `START:
    LD A, 10
LOOP:
    DEC A
    JR NZ, LOOP`;
    
    const result4 = this.assembler.assemble(labelProgram);
    this.assert(result4.success, "Label program assembles successfully");
    this.assert(result4.lineAddresses[0] === 0, "START label at address 0");
    this.assert(result4.lineAddresses[1] === 0, "LD A, 10 at address 0");
    this.assert(result4.lineAddresses[2] === 2, "LOOP label at address 2");
    this.assert(result4.lineAddresses[3] === 2, "DEC A at address 2");
    this.assert(result4.lineAddresses[4] === 3, "JR NZ, LOOP at address 3");
  }

  // Test 1: Line parsing and comments (Grammar lines 6-7, 14-15)
  testLineParsingAndComments() {
    this.consoleLogIfNode("\nTesting Line Parsing and Comments");

    // Empty lines should be ignored
    this.assertAssemblySuccess("", []);
    this.assertAssemblySuccess("\n\n\n", []);

    // Comment-only lines
    this.assertAssemblySuccess("; This is a comment", []);
    this.assertAssemblySuccess("  ; Indented comment", []);

    // Instructions with comments
    this.assertAssemblySuccess("NOP ; Comment after instruction", [0x00]);
    this.assertAssemblySuccess("  LD A, 5  ; Load 5 into A", [0x3e, 0x05]);

    // Mixed content
    this.assertAssemblySuccess(
      `
            ; Program header comment
            NOP         ; First instruction
            ; Another comment
            HALT        ; End program
        `,
      [0x00, 0x76]
    );
  }

  // Test 2: Labels and constants (Grammar lines 10-12, 64-65)
  testLabelsAndConstants() {
    this.consoleLogIfNode("\nTesting Labels and Constants");

    // Code labels with colon
    this.assertAssemblySuccess(
      `
            START:
                NOP
                HALT
        `,
      [0x00, 0x76]
    );

    // Labels with instructions on same line
    this.assertAssemblySuccess(
      `
            LOOP: LD A, 10
            END:  HALT
        `,
      [0x3e, 0x0a, 0x76]
    );

    // EQU constants (no colon)
    this.assertAssemblySuccess(
      `
            VALUE EQU 42
            LD A, VALUE
        `,
      [0x3e, 42]
    );

    // Constants with expressions
    this.assertAssemblySuccess(
      `
            BASE EQU 100
            OFFSET EQU 5
            ADDR EQU BASE + OFFSET
            LD A, ADDR
        `,
      [0x3e, 105]
    );

    // Forward label reference
    this.assertAssemblySuccess(
      `
            JR FORWARD
            NOP
            FORWARD: HALT
        `,
      [0x18, 0x01, 0x00, 0x76]
    );

    // Duplicate label should fail
    this.assertAssemblyError(
      `
            LABEL: NOP
            LABEL: HALT
        `,
      "Duplicate label"
    );
  }

  // Test 3: All directive types (Grammar lines 17-25)
  testDirectives() {
    this.consoleLogIfNode("\nTesting Directives");

    // ORG directive
    this.assertAssemblySuccess("ORG $8000\nNOP", [0x00]);
    const orgResult = this.assembler.assemble("ORG 100\nNOP");
    this.assert(
      orgResult.success && orgResult.loadAddress === 100,
      "ORG sets load address correctly"
    );

    // DB (Define Bytes) directive
    this.assertAssemblySuccess("DB 1, 2, 3", [1, 2, 3]);
    this.assertAssemblySuccess('DB "Hello"', [72, 101, 108, 108, 111]); // ASCII values
    this.assertAssemblySuccess('DB 65, "BC", 68', [65, 66, 67, 68]);

    // DEFB (alias for DB)
    this.assertAssemblySuccess("DEFB 10, 20, 30", [10, 20, 30]);

    // DEFW (Define Words) directive
    this.assertAssemblySuccess("DEFW $1234", [0x34, 0x12]); // Little-endian
    this.assertAssemblySuccess("DEFW 300, 400", [44, 1, 144, 1]); // 300=0x012C, 400=0x0190

    // DEFS (Define Space) directive
    this.assertAssemblySuccess("DEFS 3", [0, 0, 0]);
    this.assertAssemblySuccess("DEFS 2, $FF", [255, 255]);

    // END directive
    this.assertAssemblySuccess(
      `
            NOP
            END
            HALT  ; This should be ignored
        `,
      [0x00]
    );

    // EQU directive (already tested in labels section but test standalone)
    this.assertAssemblyError("EQU 42", "requires a label");
  }

  // Test 4: Instructions (Grammar lines 27-31)
  testInstructions() {
    this.consoleLogIfNode("\nTesting Instructions");

    // Basic instructions without operands
    this.assertAssemblySuccess("NOP", [0x00]);
    this.assertAssemblySuccess("HALT", [0x76]);
    this.assertAssemblySuccess("SCF", [0x37]);

    // Instructions with one operand
    this.assertAssemblySuccess("INC A", [0x3c]);
    this.assertAssemblySuccess("DEC B", [0x05]);

    // Instructions with two operands
    this.assertAssemblySuccess("LD A, B", [0x78]);
    this.assertAssemblySuccess("ADD HL, BC", [0x09]);

    // Instructions with immediate values
    this.assertAssemblySuccess("LD A, 42", [0x3e, 42]);
    this.assertAssemblySuccess("LD BC, $1234", [0x01, 0x34, 0x12]);

    // Instructions with memory references
    this.assertAssemblySuccess("LD A, (HL)", [0x7e]);
    this.assertAssemblySuccess("LD A, ($8000)", [0x3a, 0x00, 0x80]);

    // Relative jump instructions
    this.assertAssemblySuccess(
      `
            LOOP: JR LOOP
        `,
      [0x18, 0xfe]
    );

    // Conditional instructions
    this.assertAssemblySuccess("RET Z", [0xc8]);
    this.assertAssemblySuccess("JP NZ, $1234", [0xc2, 0x34, 0x12]);

    // I/O instructions
    this.assertAssemblySuccess("IN A,(80)", [0xdb, 0x50]);
    this.assertAssemblySuccess("OUT (255),A", [0xd3, 0xff]);

    // Invalid mnemonic should fail
    this.assertAssemblyError("INVALID", "Unknown mnemonic");

    // Invalid operand combination should fail
    this.assertAssemblyError("LD A, B, C", "Invalid operand combination");
  }

  // Test 5: Registers and memory references (Grammar lines 34, 36-39)
  testRegistersAndMemoryReferences() {
    this.consoleLogIfNode("\nTesting Registers and Memory References");

    // All 8-bit registers
    this.assertAssemblySuccess("INC A", [0x3c]);
    this.assertAssemblySuccess("INC B", [0x04]);
    this.assertAssemblySuccess("INC C", [0x0c]);
    this.assertAssemblySuccess("INC D", [0x14]);
    this.assertAssemblySuccess("INC E", [0x1c]);
    this.assertAssemblySuccess("INC H", [0x24]);
    this.assertAssemblySuccess("INC L", [0x2c]);

    // All 16-bit register pairs
    this.assertAssemblySuccess("INC BC", [0x03]);
    this.assertAssemblySuccess("INC DE", [0x13]);
    this.assertAssemblySuccess("INC HL", [0x23]);
    this.assertAssemblySuccess("INC SP", [0x33]);

    // Special register pairs
    this.assertAssemblySuccess("PUSH AF", [0xf5]);
    this.assertAssemblySuccess("EX AF, AF'", [0x08]);

    // Indirect register addressing
    this.assertAssemblySuccess("LD A, (BC)", [0x0a]);
    this.assertAssemblySuccess("LD A, (DE)", [0x1a]);
    this.assertAssemblySuccess("LD A, (HL)", [0x7e]);

    // Memory references with addresses
    this.assertAssemblySuccess("LD A, (0x1234)", [0x3a, 0x34, 0x12]);
    this.assertAssemblySuccess("LD (0x5678), A", [0x32, 0x78, 0x56]);

    // Verify parentheses are distinguished correctly
    this.assertAssemblySuccess("LD HL, (5 + 3) * 2", [0x21, 0x10, 0x00]);
  }

  // Test 6: Expression evaluation (Grammar lines 41-46, 72-74)
  testExpressionEvaluation() {
    this.consoleLogIfNode("\nTesting Expression Evaluation");

    // Basic arithmetic
    this.assertAssemblySuccess("LD A, 5 + 3", [0x3e, 8]);
    this.assertAssemblySuccess("LD A, 10 - 4", [0x3e, 6]);
    this.assertAssemblySuccess("LD A, 3 * 4", [0x3e, 12]);
    this.assertAssemblySuccess("LD A, 15 / 3", [0x3e, 5]);

    // Operator precedence (* / before + -)
    this.assertAssemblySuccess("LD A, 2 + 3 * 4", [0x3e, 14]); // 2 + (3*4)
    this.assertAssemblySuccess("LD A, 10 - 6 / 2", [0x3e, 7]); // 10 - (6/2)

    // Parentheses for grouping
    this.assertAssemblySuccess("LD A, (2 + 3) * 4", [0x3e, 20]);
    this.assertAssemblySuccess("LD A, 20 / (2 + 3)", [0x3e, 4]);

    // Complex expressions
    this.assertAssemblySuccess("LD A, (5 + 3) * (4 - 2)", [0x3e, 16]);

    // Expressions with symbols
    this.assertAssemblySuccess(
      `
            BASE EQU 100
            OFFSET EQU 25
            LD A, BASE + OFFSET * 2
        `,
      [0x3e, 150]
    );

    // Negative numbers
    this.assertAssemblySuccess("LD A, -(5) + 10", [0x3e, 5]);

    // Division by zero should fail assembly
    this.assertAssemblyError("LD A, 10 / 0", "Division by zero");
  }

  // Test 7: All number formats (Grammar lines 48-51)
  testNumberFormats() {
    this.consoleLogIfNode("\nTesting Number Formats");

    // Decimal numbers
    this.assertAssemblySuccess("LD A, 42", [0x3e, 42]);
    this.assertAssemblySuccess("LD A, 0", [0x3e, 0]);
    this.assertAssemblySuccess("LD A, 255", [0x3e, 255]);

    // Negative decimal numbers
    this.assertAssemblySuccess("LD A, -1", [0x3e, 255]); // Two's complement

    // Hexadecimal formats
    this.assertAssemblySuccess("LD A, $42", [0x3e, 0x42]);
    this.assertAssemblySuccess("LD A, 0x42", [0x3e, 0x42]);
    this.assertAssemblySuccess("LD A, 42H", [0x3e, 0x42]);
    this.assertAssemblySuccess("LD A, $FF", [0x3e, 255]);

    // Binary numbers
    this.assertAssemblySuccess("LD A, %10101010", [0x3e, 0xaa]);
    this.assertAssemblySuccess("LD A, %11111111", [0x3e, 255]);
    this.assertAssemblySuccess("LD A, %0", [0x3e, 0]);

    // 16-bit numbers
    this.assertAssemblySuccess("LD HL, $1234", [0x21, 0x34, 0x12]);
    this.assertAssemblySuccess("LD HL, 65535", [0x21, 0xff, 0xff]);

    // Mixed formats in expressions
    this.assertAssemblySuccess("LD A, $10 + %1010 + 5", [0x3e, 31]); // 16 + 10 + 5
  }

  // Test 8: String and character literals (Grammar lines 53-55)
  testStringAndCharacterLiterals() {
    this.consoleLogIfNode("\nTesting String and Character Literals");

    // String literals in DB
    this.assertAssemblySuccess('DB "Hello"', [72, 101, 108, 108, 111]);
    this.assertAssemblySuccess('DB "A"', [65]);
    this.assertAssemblySuccess('DB ""', []);

    // String with special characters
    this.assertAssemblySuccess(
      'DB "Line 1", 10, "Line 2"',
      [76, 105, 110, 101, 32, 49, 10, 76, 105, 110, 101, 32, 50]
    );

    // Non-printable characters via chr()
    this.assertAssemblySuccess(
      "DB chr(9), chr(10), chr(13), chr(0)",
      [9, 10, 13, 0]
    ); // tab, newline, CR, null

    // Character literals
    this.assertAssemblySuccess("LD A, 'A'", [0x3e, 65]);
    this.assertAssemblySuccess("LD A, '0'", [0x3e, 48]);
    this.assertAssemblySuccess("LD A, ' '", [0x3e, 32]);
    this.assertAssemblySuccess("LD A, '['", [0x3e, 91]);

    // Character literals in expressions
    this.assertAssemblySuccess("LD A, 'A' + 1", [0x3e, 66]);

    // Error cases
    this.assertAssemblyError("LD A, 'AB'", "Unterminated character literal");
    this.assertAssemblyError("LD A, ''", "Empty character literal");
  }

  // Test 9: Function calls (Grammar line 58)
  testFunctionCalls() {
    this.consoleLogIfNode("\nTesting Function Calls");

    // len() function with DB strings
    this.assertAssemblySuccess(
      `
            MESSAGE: DB "Hello World"
            LD A, len(MESSAGE)
        `,
      [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 0x3e, 11]
    );

    // len() in expressions
    this.assertAssemblySuccess(
      `
            TEXT: DB "Test"
            LD A, len(TEXT) + 5
        `,
      [84, 101, 115, 116, 0x3e, 9]
    );

    // len() with empty string
    this.assertAssemblySuccess(
      `
            EMPTY: DB ""
            LD A, len(EMPTY)
        `,
      [0x3e, 0]
    );

    // chr() function tests
    this.assertAssemblySuccess("LD A, chr(65)", [0x3e, 65]); // chr(65) = 'A'
    this.assertAssemblySuccess("DB chr(0)", [0]);

    // Error cases
    this.assertAssemblyError("LD A, len(UNDEFINED)", "not found");
    this.assertAssemblyError(
      `
            NOTDB: EQU 42
            LD A, len(NOTDB)
        `,
      "not a DB statement"
    );
  }

  // Test 10: Error handling and edge cases
  testErrorHandling() {
    this.consoleLogIfNode("\nTesting Error Handling");

    // Syntax errors
    this.assertAssemblyError("LD A B", "Invalid operand combination");
    this.assertAssemblyError("123INVALID", "Syntax error");

    // Undefined symbols
    this.assertAssemblyError("LD A, UNDEFINED", "Unknown symbol");
    this.assertAssemblyError("JR UNDEFINED", "Unknown symbol");

    // Invalid operands
    this.assertAssemblyError("LD 42, A", "Invalid operand");
    this.assertAssemblyError("INC 42", "Invalid operand");

    // Out of range values
    this.assertAssemblyError("LD A, 256", "8-bit immediate value out of range");

    // Relative jump out of range
    this.assertAssemblyError(
      `
            ORG 0
            JR FAR
            DEFS 200, 0
            FAR: NOP
        `,
      "out of range"
    );

    // Multiple ORG directives
    this.assertAssemblyError(
      `
            ORG 100
            NOP
            ORG 200
        `,
      "can only be used when current address is zero"
    );
  }

  // Test 11: Complex programs combining multiple features
  testComplexPrograms() {
    this.consoleLogIfNode("\nTesting Complex Programs");

    // Program with all grammar features
    const complexProgram = `
            ; Complex Z80 Assembly Program
            ; Tests multiple grammar features together
            
            ; Constants
            BUFFER_SIZE EQU 16
            START_ADDR EQU $8000 + BUFFER_SIZE
            
            ; Set origin
            ORG START_ADDR
            
            ; Main program
            MAIN:
                LD HL, BUFFER          ; Point to buffer
                LD BC, BUFFER_SIZE     ; Size in BC
                LD A, 'X'              ; Fill character
                
            FILL_LOOP:
                LD (HL), A             ; Store character
                INC HL                 ; Next position
                DEC BC                 ; Decrement counter
                LD A, B                ; Check if BC = 0
                OR C
                JR NZ, FILL_LOOP       ; Continue if not zero
                
                ; Print message
                LD HL, MESSAGE
                CALL PRINT_STRING
                
                HALT                   ; End program
                
            ; Data section
            BUFFER:
                DEFS BUFFER_SIZE, 0    ; Reserve buffer space
                
            MESSAGE:
                DB "Program complete!", 0
                
            ; Subroutine
            PRINT_STRING:
                LD A, (HL)             ; Get character
                CP 0                   ; Check for null terminator
                RET Z                  ; Return if end of string
                ; Output character code would go here
                INC HL                 ; Next character
                JR PRINT_STRING        ; Continue
                
            END                        ; End of program
        `;

    this.assertAssemblySuccess(
      complexProgram,
      [
        0x21, 0x26, 0x80, 0x01, 0x10, 0x00, 0x3e, 0x58, 0x77, 0x23, 0x0b, 0x78,
        0xb1, 0x20, 0xf9, 0x21, 0x36, 0x80, 0xcd, 0x48, 0x80, 0x76, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x50, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x20, 0x63, 0x6f,
        0x6d, 0x70, 0x6c, 0x65, 0x74, 0x65, 0x21, 0x00, 0x7e, 0xfe, 0x00, 0xc8,
        0x23, 0x18, 0xf9,
      ]
    );

    // Program testing operator precedence and expressions
    const mathProgram = `
            BASE EQU 100
            MULTIPLIER EQU 3
            OFFSET EQU 7
            
            ; Test complex expressions
            VALUE1 EQU BASE + MULTIPLIER * OFFSET    ; Should be 100 + (3 * 7) = 121
            VALUE2 EQU (BASE + MULTIPLIER) * OFFSET  ; Should be (100 + 3) * 7 = 721
            
            START:
                LD A, VALUE1           ; Load 121
                LD B, VALUE2 / 100     ; Load 7 (721/100 = 7)
                LD C, 'A' + VALUE1 - BASE  ; Load 86 (65 + 121 - 100)
                HALT
        `;

    this.assertAssemblySuccess(
      mathProgram,
      [0x3e, 0x79, 0x06, 0x07, 0x0e, 0x56, 0x76]
    );

    // Program with forward and backward references
    const jumpProgram = `
            JR FORWARD        ; Forward reference
            
            BACKWARD: 
                LD A, 42
                RET
                
            FORWARD:
                CALL BACKWARD     ; Backward reference  
                JR END_PROG      ; Forward reference
                
            END_PROG:
                HALT
        `;

    this.assertAssemblySuccess(
      jumpProgram,
      [0x18, 0x03, 0x3e, 0x2a, 0xc9, 0xcd, 0x02, 0x00, 0x18, 0x00, 0x76]
    );
  }

  // Test 12: Comprehensive instruction coverage - every supported mnemonic
  testComprehensiveInstructions() {
    this.consoleLogIfNode("\nTesting Comprehensive Instruction Coverage");

    // No operand instructions
    this.assertAssemblySuccess("NOP", [0x00]);
    this.assertAssemblySuccess("HALT", [0x76]);
    this.assertAssemblySuccess("RLCA", [0x07]);
    this.assertAssemblySuccess("SCF", [0x37]);
    this.assertAssemblySuccess("CCF", [0x3f]);
    this.assertAssemblySuccess("CPL", [0x2f]);
    this.assertAssemblySuccess("NEG", [0xed, 0x44]);
    this.assertAssemblySuccess("LDIR", [0xed, 0xb0]);
    this.assertAssemblySuccess("RET", [0xc9]);

    // 8-bit increment/decrement
    this.assertAssemblySuccess("DEC A", [0x3d]);
    this.assertAssemblySuccess("DEC C", [0x0d]);
    this.assertAssemblySuccess("DEC D", [0x15]);
    this.assertAssemblySuccess("DEC E", [0x1d]);
    this.assertAssemblySuccess("DEC H", [0x25]);
    this.assertAssemblySuccess("DEC L", [0x2d]);

    // 16-bit increment/decrement
    this.assertAssemblySuccess("DEC BC", [0x0b]);
    this.assertAssemblySuccess("DEC DE", [0x1b]);
    this.assertAssemblySuccess("DEC HL", [0x2b]);
    this.assertAssemblySuccess("DEC SP", [0x3b]);

    // Arithmetic with register
    this.assertAssemblySuccess("ADD A,B", [0x80]);
    this.assertAssemblySuccess("ADD A,C", [0x81]);
    this.assertAssemblySuccess("ADD A,D", [0x82]);
    this.assertAssemblySuccess("ADD A,E", [0x83]);
    this.assertAssemblySuccess("ADD A,H", [0x84]);
    this.assertAssemblySuccess("ADD A,L", [0x85]);
    this.assertAssemblySuccess("ADD A,A", [0x87]);

    // Arithmetic with immediate
    this.assertAssemblySuccess("ADD A,42", [0xc6, 0x2a]);
    this.assertAssemblySuccess("ADC A,42", [0xce, 0x2a]);
    this.assertAssemblySuccess("CP 42", [0xfe, 0x2a]);
    this.assertAssemblySuccess("OR 42", [0xf6, 0x2a]);
    this.assertAssemblySuccess("XOR 42", [0xee, 0x2a]);
    this.assertAssemblySuccess("AND 42", [0xe6, 0x2a]);

    // Arithmetic with register (variants)
    this.assertAssemblySuccess("SUB B", [0x90]);
    this.assertAssemblySuccess("CP B", [0xb8]);
    this.assertAssemblySuccess("OR B", [0xb0]);
    this.assertAssemblySuccess("AND B", [0xa0]);

    // Stack operations
    this.assertAssemblySuccess("POP BC", [0xc1]);
    this.assertAssemblySuccess("POP DE", [0xd1]);
    this.assertAssemblySuccess("POP HL", [0xe1]);
    this.assertAssemblySuccess("POP AF", [0xf1]);

    // Jump and call instructions
    this.assertAssemblySuccess("CALL 1234", [0xcd, 0xd2, 0x04]);
    this.assertAssemblySuccess("JP 1234", [0xc3, 0xd2, 0x04]);
    this.assertAssemblySuccess("JR 10", [0x18, 0x08]);

    // Bit shift operations
    this.assertAssemblySuccess("SLA A", [0xcb, 0x27]);
    this.assertAssemblySuccess("SLA B", [0xcb, 0x20]);
    this.assertAssemblySuccess("SRA A", [0xcb, 0x2f]);
    this.assertAssemblySuccess("SRL A", [0xcb, 0x3f]);

    // Bit test operations
    this.assertAssemblySuccess("BIT 0,A", [0xcb, 0x47]);

    // Conditional returns
    this.assertAssemblySuccess("RET Z", [0xc8]);
    this.assertAssemblySuccess("RET NZ", [0xc0]);
    this.assertAssemblySuccess("RET C", [0xd8]);
    this.assertAssemblySuccess("RET NC", [0xd0]);

    // Conditional jumps
    this.assertAssemblySuccess("JP Z,1234", [0xca, 0xd2, 0x04]);
    this.assertAssemblySuccess("JP NZ,1234", [0xc2, 0xd2, 0x04]);
    this.assertAssemblySuccess("JP C,1234", [0xda, 0xd2, 0x04]);
    this.assertAssemblySuccess("JP NC,1234", [0xd2, 0xd2, 0x04]);

    // Conditional relative jumps
    this.assertAssemblySuccess("JR Z,10", [0x28, 0x08]);
    this.assertAssemblySuccess("JR NZ,10", [0x20, 0x08]);
    this.assertAssemblySuccess("JR C,10", [0x38, 0x08]);
    this.assertAssemblySuccess("JR NC,10", [0x30, 0x08]);

    // Additional load variants
    this.assertAssemblySuccess("LD B,C", [0x41]);
    this.assertAssemblySuccess("LD L,A", [0x6f]);

    // Load with immediate for all registers
    this.assertAssemblySuccess("LD B,42", [0x06, 0x2a]);
    this.assertAssemblySuccess("LD C,42", [0x0e, 0x2a]);
    this.assertAssemblySuccess("LD D,42", [0x16, 0x2a]);
    this.assertAssemblySuccess("LD E,42", [0x1e, 0x2a]);
    this.assertAssemblySuccess("LD H,42", [0x26, 0x2a]);
    this.assertAssemblySuccess("LD L,42", [0x2e, 0x2a]);

    // 16-bit loads
    this.assertAssemblySuccess("LD DE,1234", [0x11, 0xd2, 0x04]);
    this.assertAssemblySuccess("LD HL,1234", [0x21, 0xd2, 0x04]);
    this.assertAssemblySuccess("LD SP,1234", [0x31, 0xd2, 0x04]);

    // Exchange instructions
    this.assertAssemblySuccess("EX DE,HL", [0xeb]);

    // Additional arithmetic variants
    this.assertAssemblySuccess("SUB C", [0x91]);
    this.assertAssemblySuccess("SUB D", [0x92]);
    this.assertAssemblySuccess("SUB E", [0x93]);
    this.assertAssemblySuccess("OR C", [0xb1]);
    this.assertAssemblySuccess("OR D", [0xb2]);
    this.assertAssemblySuccess("AND C", [0xa1]);
    this.assertAssemblySuccess("AND D", [0xa2]);

    // DJNZ instruction
    this.assertAssemblySuccess("DJNZ 10", [0x10, 0x08]);
  }

  // Test 14: Branch range limits
  testBranchRange() {
    this.consoleLogIfNode("\nTesting Branch Range Limits");

    // Test 1: 127 NOPs forward - should succeed
    let sourceCode127 = `ORG 32768
START:
    JR TARGET        ; Forward relative jump
`;
    
    // Add exactly 127 NOPs
    for (let i = 0; i < 127; i++) {
        sourceCode127 += "    NOP\n";
    }
    
    sourceCode127 += `TARGET:
    HALT
`;
    
    const result127 = this.assembler.assemble(sourceCode127);
    this.assert(
      result127.success,
      "Forward branch with 127 NOPs should succeed",
      result127.error || (result127.errors ? result127.errors.map(e => e.message).join(', ') : '')
    );

    // Test 2: 128 NOPs forward - should fail
    let sourceCode128 = `ORG 32768
START:
    JR TARGET        ; Forward relative jump
`;
    
    // Add exactly 128 NOPs
    for (let i = 0; i < 128; i++) {
        sourceCode128 += "    NOP\n";
    }
    
    sourceCode128 += `TARGET:
    HALT
`;
    
    const result128 = this.assembler.assemble(sourceCode128);
    this.assert(
      !result128.success,
      "Forward branch with 128 NOPs should fail",
      result128.success ? "Expected failure but got success" : "Correctly failed as expected"
    );

    // Test 3: 125 NOPs backward - should succeed (offset = -128, just within range)
    let sourceCode125Back = `ORG 32768
TARGET:
    NOP              ; One instruction at target (1 byte)
`;
    
    // Add exactly 125 NOPs (125 bytes)
    for (let i = 0; i < 125; i++) {
        sourceCode125Back += "    NOP\n";
    }
    
    sourceCode125Back += `    JR TARGET        ; Backward relative jump (offset = 0 - (1+125+2) = -128)
    HALT
`;
    
    const result125Back = this.assembler.assemble(sourceCode125Back);
    this.assert(
      result125Back.success,
      "Backward branch with 125 NOPs should succeed (offset -128)",
      result125Back.error || (result125Back.errors ? result125Back.errors.map(e => e.message).join(', ') : '')
    );

    // Test 4: 126 NOPs backward - should fail (offset = -129, out of range)
    let sourceCode126Back = `ORG 32768
TARGET:
    NOP              ; One instruction at target (1 byte)
`;
    
    // Add exactly 126 NOPs (126 bytes)
    for (let i = 0; i < 126; i++) {
        sourceCode126Back += "    NOP\n";
    }
    
    sourceCode126Back += `    JR TARGET        ; Backward relative jump (offset = 0 - (1+126+2) = -129)
    HALT
`;
    
    const result126Back = this.assembler.assemble(sourceCode126Back);
    this.assert(
      !result126Back.success,
      "Backward branch with 126 NOPs should fail (offset -129)",
      result126Back.success ? "Expected failure but got success" : "Correctly failed as expected"
    );

    // Test edge case: exactly at the limit
    const exactLimitForward = `ORG 32768
START:
    JR TARGET
` + "    NOP\n".repeat(126) + `TARGET:
    HALT
`;

    const resultExactLimit = this.assembler.assemble(exactLimitForward);
    this.assert(
      resultExactLimit.success,
      "Forward branch at exact limit (126 NOPs) should succeed",
      resultExactLimit.error || (resultExactLimit.errors ? resultExactLimit.errors.map(e => e.message).join(', ') : '')
    );

    // Test simple JR to skip 1 NOP
    const simpleSkipTest = `ORG 32768
START:
    JR SKIP          ; Jump over the NOP to SKIP label
    NOP              ; This should be skipped
SKIP:
    HALT             ; Jump lands here
`;
    
    const resultSimpleSkip = this.assembler.assemble(simpleSkipTest);
    this.assert(
      resultSimpleSkip.success,
      "JR SKIP should jump over 1 NOP instruction",
      resultSimpleSkip.error || (resultSimpleSkip.errors ? resultSimpleSkip.errors.map(e => e.message).join(', ') : '')
    );

    // Verify the generated bytecode is correct
    if (resultSimpleSkip.success) {
      // JR instruction is 2 bytes, NOP is 1 byte, so SKIP is at address 32768+3
      // JR from 32768 to 32771: offset = 32771 - (32768 + 2) = 1
      // Expected: JR rel = [0x18, 0x01], NOP = [0x00], HALT = [0x76]
      const expectedBytes = [0x18, 0x01, 0x00, 0x76];
      const actualBytes = resultSimpleSkip.machineCode;
      
      this.assert(
        JSON.stringify(actualBytes) === JSON.stringify(expectedBytes),
        "JR SKIP generates correct bytecode [0x18, 0x01, 0x00, 0x76]",
        `Expected: [${expectedBytes.join(', ')}], Got: [${actualBytes.join(', ')}]`
      );
    }
  }

  printResults() {
    this.consoleLogIfNode("\n" + "=".repeat(60));
    this.consoleLogIfNode("TEST RESULTS SUMMARY");
    this.consoleLogIfNode("=".repeat(60));
    this.consoleLogIfNode(`Total tests: ${this.testCount}`);
    this.consoleLogIfNode(`Passed: ${this.passedCount}`);
    this.consoleLogIfNode(`Failed: ${this.testCount - this.passedCount}`);
    this.consoleLogIfNode(
      `Success rate: ${((this.passedCount / this.testCount) * 100).toFixed(1)}%`
    );

    if (this.failedTests.length > 0) {
      console.error("\nFAILED TESTS:");
      this.failedTests.forEach((test, i) => {
        console.error(`${i + 1}. ${test.name}`);
        if (test.details) {
          console.error(`   Details: ${test.details}`);
        }
      });
    }

    if (this.passedCount === this.testCount) {
      this.consoleLogIfNode(
        "\nALL TESTS PASSED! The Z80 Assembler fully implements the specification."
      );
    }
  }
}

// Run the tests if this is being run directly in Node.js
if (typeof require !== 'undefined' && require.main === module) {
  const z80AssemblerTestSuite = new Z80AssemblerTestSuite();
  z80AssemblerTestSuite.runAllTests();
}

// Export for use in other modules (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Z80AssemblerTestSuite;
}

// Also make available as global for browser use
if (typeof window !== 'undefined') {
  window.Z80AssemblerTestSuite = Z80AssemblerTestSuite;
}
