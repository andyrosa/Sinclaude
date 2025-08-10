/**
 * Z80 Assembler grammar specification
 * 
 * The assembler returns:
 * - machineCode: Array of bytes representing the assembled program
 * - loadAddress: The starting address where the program should be loaded
 * - instructionDetails: Array with details for each source line (address, source, opcodes)
 * 
 * GRAMMAR SPECIFICATION (EBNF):
 * 
 * program = { line } ;
 * line = [ white_space ] [ statement ] [ comment ] EOL ;
 * statement = [ code_label ] [ directive | instruction ] | constant_def ;
 * 
 * (* Labels *)
 * code_label = identifier ":" ;
 * constant_def = identifier white_space "EQU" white_space arithmetic_expression ;
 * 
 * (* Comments *)
 * comment = ";" { any_character } ;
 * 
 * (* Directives *)
 * directive = org_directive | equ_directive | data_directive | end_directive ;
 * org_directive = "ORG" white_space arithmetic_expression ;
 * equ_directive = "EQU" white_space arithmetic_expression ;
 * data_directive = db_directive | dw_directive | ds_directive ;
 * db_directive = ( "DB" | "DEFB" ) white_space operand_list ;
 * dw_directive = "DEFW" white_space operand_list ;
 * ds_directive = "DEFS" white_space arithmetic_expression [ "," white_space arithmetic_expression ] ;
 * end_directive = "END" ;
 * 
 * (* Instructions *)
 * instruction = mnemonic [ white_space operand_list ] ;
 * mnemonic = identifier ;
 * operand_list = operand { "," white_space operand } ;
 * operand = register | memory_ref | immediate | relative | string_literal ;
 * 
 * (* Registers and Register Pairs *)
 * register = "A" | "B" | "C" | "D" | "E" | "H" | "L" | "BC" | "DE" | "HL" | "SP" | "AF" | "AF'" ;
 * 
 * (* Memory References - Indirect Addressing *)
 * memory_ref = "(" arithmetic_expression ")" | indirect_register ;
 * indirect_register = "(BC)" | "(DE)" | "(HL)" ;
 * 
 * (* Immediate Values *)
 * immediate = arithmetic_expression ;
 * relative = arithmetic_expression ;
 * 
 * (* Arithmetic Expressions - Parentheses here are ONLY for mathematical grouping *)
 * arithmetic_expression = term { ( "+" | "-" ) term } ;
 * term = factor { ( "*" | "/" ) factor } ;
 * factor = "(" arithmetic_expression ")" | atom ;
 * atom = number | symbol | character_literal | function_call ;
 * 
 * (* Numbers *)
 * number = decimal | hexadecimal | binary ;
 * decimal = [ "-" ] digit { digit } ;
 * hexadecimal = "$" hex_digit { hex_digit } | "0x" hex_digit { hex_digit } | hex_digit { hex_digit } "H" ;
 * binary = "%" binary_digit { binary_digit } ;
 * 
 * (* String and Character Literals *)
 * character_literal = "'" ( printable_character | escape_sequence ) "'" ;
 * string_literal = '"' { string_character } '"' ;
 * string_character = printable_character | escape_sequence ;
 * escape_sequence = "\" ( "n" | "t" | "r" | "0" | "\" | "'" | '"' ) ;
 * 
 * (* Function Calls *)
 * function_call = "len" "(" symbol ")" | "chr" "(" arithmetic_expression ")" ;
 * 
 * (* Symbols and Identifiers *)
 * symbol = identifier ;
 * identifier = letter { letter | digit | "_" } ;
 * 
 * - Code labels: LOOP:    (require colon)
 * - Constants:   SIZE EQU 100   (no colon)
 * 
 * PARENTHESES USAGE:
 * - Indirect addressing: LD A, (HL)      ; Load from address in HL
 * - Memory reference:    LD A, ($8000)   ; Load from address $8000  
 * - Memory reference:    LD A, (1+2)     ; Load from address 3
 * - Immediate value:     LD A, (1+2)*3   ; Load immediate value 9
 * - Math grouping:       LD A, 5+(3*2)   ; Load immediate value 11
 * 
 * EXPRESSION EVALUATION:
 * Operators: + - * / () with standard precedence
 * Functions: len(symbol) returns string length, chr(n) returns character with ASCII code n
 * 
 * ESCAPE SEQUENCES:
 * \n = newline (10), \t = tab (9), \r = carriage return (13), \0 = null (0)
 * \\ = backslash (92), \' = single quote (39), \" = double quote (34)
 * 
 * EXAMPLES:
 * HELLO: DB "Hello\nWorld\0"     ; String with newline and null terminator
 * NEWLINE: EQU '\n'              ; Character literal with escape sequence  
 * NULLTERM: DB "test", chr(0)    ; String followed by null character
 * TABCHAR: EQU chr(9)            ; Tab character using chr() function
 */
class Z80Assembler {
    // --- Constants for operand patterns ---
    static OPERAND = {
        // Immediate values
        IMM8: 'n',      // 8-bit immediate value
        IMM16: 'nn',    // 16-bit immediate value

        // Memory pointers from immediate values
        MEM8: '(n)',    // 8-bit memory address (I/O)
        MEM16: '(nn)',  // 16-bit memory address

        // String literal for DB
        STRING: 'string',

        // Relative displacement for JR, DJNZ
        RELATIVE: 'd'
    };

    /**
     * Initializes the assembler and builds the instruction lookup table.
     */
    constructor() {
        /**
         * @type {Map<string, Array<object>>}
         * A map from a mnemonic to a list of its possible instruction definitions.
         */
        this.instructionMap = new Map();
        this._buildInstructionSet();
    }

    /**
     * Assembles Z80 source code into machine code.
     *
     * @param {string} sourceCode The Z80 assembly source code.
     * @returns {{success: boolean, machineCode?: number[], loadAddress?: number, lineAddresses?: number[], errors?: {line: number, message: string}[]}}
     *          An object indicating success or failure. On success, it includes the
     *          machine code, load address, and line addresses. On failure, it includes an array of errors.
     */
    assemble(sourceCode) {
        this.sourceLines = sourceCode.split('\n');
        this.symbols = {}; // Single symbol table for labels and constants
        this.dbLengths = {}; // Dictionary mapping DB symbol names to their string lengths
        this.errors = [];
        this.loadAddress = 0; // Default to address 0
        this.currentAddress = 0; // Default to address 0
        this.parsedLines = [];
        this.instructionDetails = []; // Track instruction details for each source line

        try {
            // --- First Pass: Parse lines, define symbols, and calculate addresses ---
            this._performFirstPass();

            if (this.errors.length > 0) {
                // Abort if there were errors in the first pass
                throw new Error("Assembly failed due to errors in the first pass.");
            }

            // --- Second Pass: Generate machine code ---
            const machineCode = this._performSecondPass();

            if (this.errors.length > 0) {
                throw new Error("Assembly failed due to errors on second pass.");
            }

            return {
                success: true,
                machineCode,
                loadAddress: this.loadAddress,
                instructionDetails: this.instructionDetails,
            };
        } catch (e) {
            // This catches fatal errors or explicitly thrown ones.
            // Individual line errors are already in this.errors.
            if (this.errors.length === 0) {
                this.errors.push({ line: -1, message: e.message });
            }
            return {
                success: false,
                errors: this.errors,
            };
        }
    }

    /**
     * PASS 1:
     * - Parses each line into a structured format (Intermediate Representation).
     * - Populates the symbol table (labels and equates).
     * - Calculates the memory address for each line.
     * - Reports syntax errors and undefined equates.
     */
    _performFirstPass() {
        // Initialize instruction details array with all source lines
        this.instructionDetails = new Array(this.sourceLines.length);
        
        // First, populate instructionDetails with all source lines
        for (let i = 0; i < this.sourceLines.length; i++) {
            this.instructionDetails[i] = {
                startAddress: null, // Will be filled during processing
                sourceString: this.sourceLines[i],
                opcodes: [] // Will be filled in second pass
            };
        }
        
        for (let i = 0; i < this.sourceLines.length; i++) {
            const lineNum = i + 1;
            const line = this.sourceLines[i];

            // Record the current address for this line (before processing)
            this.instructionDetails[i].startAddress = this.currentAddress;

            const parsed = this._parseLine(line, lineNum);
            if (!parsed) continue; // Skip empty/comment lines

            // Process ORG directive first to set addresses before processing labels
            if (parsed.mnemonic && parsed.mnemonic.toUpperCase() === 'ORG') {
                if (this.currentAddress !== 0) {
                    this._reportError(lineNum, `ORG directive can only be used when current address is zero. Current address is ${this.currentAddress}.`);
                    return;
                }
                this.loadAddress = this._evaluateExpression(parsed.operands[0], this.symbols, lineNum);
                this.currentAddress = this.loadAddress;
                // Update the instruction details for this ORG line
                this.instructionDetails[i].startAddress = this.currentAddress;
            }

            this.parsedLines.push(parsed);

            // If the line has a label, record its current address (unless it's an EQU)
            if (parsed.label) {
                const mnemonic = parsed.mnemonic ? parsed.mnemonic.toUpperCase() : '';
                if (mnemonic !== 'EQU') {
                    if (this.symbols.hasOwnProperty(parsed.label.toUpperCase())) {
                        this._reportError(lineNum, `Duplicate label definition: '${parsed.label}'`);
                        return; // Stop processing on duplicate label error
                    } else {
                        this.symbols[parsed.label.toUpperCase()] = this.currentAddress;
                    }
                }
            }

            // Process directives or calculate instruction size
            if (parsed.mnemonic) {
                const mnemonic = parsed.mnemonic.toUpperCase();
                switch (mnemonic) {
                    case 'ORG':
                        // Already processed above
                        break;
                    case 'EQU':
                        if (!parsed.label) {
                            this._reportError(lineNum, `EQU directive requires a label.`);
                        } else if (this.symbols.hasOwnProperty(parsed.label.toUpperCase())) {
                            this._reportError(lineNum, `Duplicate symbol definition: '${parsed.label}'`);
                            return; // Stop processing on duplicate symbol error
                        } else {
                            const value = this._evaluateExpression(parsed.operands[0], this.symbols, lineNum);
                            if (isNaN(value)) {
                                return; // Error already reported, stop processing
                            }
                            this.symbols[parsed.label.toUpperCase()] = value;
                        }
                        break;
                    case 'DB':
                    case 'DEFB':
                        // Store string length if this DB has a label and contains a string
                        if (parsed.label && parsed.operands.length === 1) {
                            const operand = parsed.operands[0];
                            if (operand.startsWith('"') && operand.endsWith('"')) {
                                const stringLength = operand.length - 2; // Exclude quotes
                                this.dbLengths[parsed.label.toUpperCase()] = stringLength;
                            }
                        }
                        this.currentAddress += this._calculateDataSize(parsed);
                        break;
                    case 'DEFW':
                    case 'DEFS':
                        this.currentAddress += this._calculateDataSize(parsed);
                        break;
                    case 'END':
                        // Stop processing further lines
                        return;
                    default:
                        // It's an instruction, so find its definition and size
                        const instruction = this._resolveInstruction(parsed, lineNum);
                        if (instruction) {
                            this.currentAddress += instruction.size;
                        }
                        break; // Error already reported by _resolveInstruction
                }
            }
        }
    }

    /**
     * PASS 2:
     * - Iterates over the parsed lines (IR).
     * - Generates the final machine code bytes using the completed symbol table.
     * - Reports errors related to undefined labels or out-of-range values.
     */
    _performSecondPass() {
        const machineCode = [];
        this.currentAddress = this.loadAddress;

        for (const parsed of this.parsedLines) {
            const lineNum = parsed.lineNum;
            const sourceLineIndex = lineNum - 1; // Convert to 0-based index
            const mnemonic = parsed.mnemonic ? parsed.mnemonic.toUpperCase() : '';
            
            // Skip directives that don't generate code
            if (!mnemonic || ['ORG', 'EQU', 'END'].includes(mnemonic)) {
                if (mnemonic === 'ORG') {
                    const address = this._evaluateExpression(parsed.operands[0], this.symbols, parsed.lineNum);
                    if (isNaN(address)) {
                        return machineCode; // Error already reported, stop assembly
                    }
                    this.currentAddress = address;
                }
                continue;
            }

            let bytes = [];
            
            switch (mnemonic) {
                case 'DB':
                case 'DEFB':
                    bytes = this._generateDataBytes(parsed);
                    break;
                case 'DEFW':
                    bytes = this._generateDataWords(parsed);
                    break;
                case 'DEFS':
                    const size = this._evaluateExpression(parsed.operands[0], this.symbols, parsed.lineNum);
                    let fill = 0;
                    if (parsed.operands.length > 1) {
                        fill = this._evaluateExpression(parsed.operands[1], this.symbols, parsed.lineNum);
                        if (isNaN(fill)) {
                            bytes = []; // Error already reported by _evaluateExpression
                            break;
                        }
                    }
                    if (isNaN(size)) {
                        bytes = []; // Error already reported by _evaluateExpression
                        break;
                    }
                    bytes = Array(size).fill(fill & 0xFF);
                    break;
                default:
                    const instruction = this._resolveInstruction(parsed, parsed.lineNum);
                    if (instruction) {
                       bytes = this._generateInstructionBytes(instruction, parsed);
                    }
                    break;
            }
            
            // Store the opcodes in the instruction details for this source line
            if (sourceLineIndex >= 0 && sourceLineIndex < this.instructionDetails.length) {
                this.instructionDetails[sourceLineIndex].opcodes = bytes.slice(); // Copy the bytes array
            }
            
            machineCode.push(...bytes);
            this.currentAddress += bytes.length;
        }

        return machineCode;
    }


    /**
     * Parses a single line of assembly source code into its constituent parts.
     * @param {string} line - The raw line of code.
     * @param {number} lineNum - The line number, for error reporting.
     * @returns {object|null} A parsed line object or null for empty lines.
     */
    _parseLine(line, lineNum) {
        // Handle different line formats:
        // 1. "label: mnemonic operands" 
        // 2. "label mnemonic operands" (for EQU)
        // 3. "mnemonic operands" (no label)
        
        // First try: label with colon
        let match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):(?:\s+([a-zA-Z_]+)(?:\s+(.*?))?)?\s*(?:;.*)?$/);
        if (match) {
            const [, label, mnemonic, operandStr] = match;
            return this._buildParsedLine(lineNum, label, mnemonic, operandStr);
        }
        
        // Second try: label without colon (for EQU statements)
        match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+(EQU)\s+(.*?)\s*(?:;.*)?$/i);
        if (match) {
            const [, label, mnemonic, operandStr] = match;
            return this._buildParsedLine(lineNum, label, mnemonic, operandStr);
        }
        
        // Third try: no label, just mnemonic and operands
        match = line.match(/^\s*([a-zA-Z_]+)(?:\s+(.*?))?\s*(?:;.*)?$/);
        if (match) {
            const [, mnemonic, operandStr] = match;
            return this._buildParsedLine(lineNum, null, mnemonic, operandStr);
        }
        
        // No match - check if it's empty or comment
        if (line.trim() === '' || line.trim().startsWith(';')) {
            return null;
        }
        
        this._reportError(lineNum, `Syntax error.`);
        return null;
    }
    
    _buildParsedLine(lineNum, label, mnemonic, operandStr) {
        const result = { lineNum, label, mnemonic };

        if (operandStr) {
            // Special case for string literals to avoid splitting them by commas
            const stringLiteralRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
            const placeholders = [];
            let processedOperandStr = operandStr.replace(stringLiteralRegex, (match) => {
                placeholders.push(match);
                return `__STRING_PLACEHOLDER_${placeholders.length - 1}__`;
            });
            
            result.operands = processedOperandStr
                .split(',')
                .map(op => op.trim())
                .filter(op => op)
                .map(op => {
                    // Only restore if it's an exact match (pure string literal)
                    const exactMatch = op.match(/^__STRING_PLACEHOLDER_(\d+)__$/);
                    if (exactMatch) {
                        return placeholders[parseInt(exactMatch[1], 10)];
                    }
                    
                    // If it contains placeholders but isn't an exact match (i.e., it's an expression),
                    // restore all placeholders in the expression
                    if (op.includes('__STRING_PLACEHOLDER_')) {
                        return op.replace(/__STRING_PLACEHOLDER_(\d+)__/g, (match, index) => {
                            return placeholders[parseInt(index, 10)];
                        });
                    }
                    
                    return op;
                });
        } else {
            result.operands = [];
        }
        
        return result;
    }

    /**
     * Finds the matching instruction definition for a parsed line.
     * @param {object} parsedLine - The output from _parseLine.
     * @param {number} lineNum - The current line number.
     * @returns {object|null} The matched instruction definition or null.
     */
    _resolveInstruction(parsedLine, lineNum) {
        const { mnemonic, operands } = parsedLine;
        const candidates = this.instructionMap.get(mnemonic.toUpperCase());

        if (!candidates) {
            this._reportError(lineNum, `Unknown mnemonic '${mnemonic}'`);
            return null;
        }

        // Sort candidates to try specific patterns before generic ones
        const sortedCandidates = candidates.sort((a, b) => {
            const aHasGeneric = a.operands.some(op => 
                op === Z80Assembler.OPERAND.IMM8 || 
                op === Z80Assembler.OPERAND.IMM16 || 
                op === Z80Assembler.OPERAND.RELATIVE ||
                op === Z80Assembler.OPERAND.MEM16
            );
            const bHasGeneric = b.operands.some(op => 
                op === Z80Assembler.OPERAND.IMM8 || 
                op === Z80Assembler.OPERAND.IMM16 || 
                op === Z80Assembler.OPERAND.RELATIVE ||
                op === Z80Assembler.OPERAND.MEM16
            );
            if (aHasGeneric && !bHasGeneric) return 1;  // b (specific) comes first
            if (!aHasGeneric && bHasGeneric) return -1; // a (specific) comes first
            return 0; // same priority
        });

        for (const inst of sortedCandidates) {
            if (inst.operands.length !== operands.length) continue;

            const patternMatch = inst.operands.every((pattern, i) => {
                const operand = operands[i].toUpperCase();
                switch (pattern) {
                    case Z80Assembler.OPERAND.IMM8:
                    case Z80Assembler.OPERAND.IMM16:
                    case Z80Assembler.OPERAND.RELATIVE:
                        // These patterns match immediate values (not memory references)
                        // Memory reference: entire operand is (expression) with balanced parens
                        // Immediate: either no outer parens, or arithmetic with parens for grouping
                        return !this._isMemoryReference(operand);
                    case Z80Assembler.OPERAND.MEM16:
                    case Z80Assembler.OPERAND.MEM8:
                        // These patterns match memory references: (expression)
                        return this._isMemoryReference(operand);
                    case Z80Assembler.OPERAND.STRING:
                        return operand.startsWith('"') && operand.endsWith('"');
                    default:
                        // Exact match for registers or conditions (e.g., 'A', 'BC', 'NZ')
                        return pattern === operand;
                }
            });

            if (patternMatch) {
                // Calculate size for the first pass
                let size = inst.opcodes.length;
                inst.operands.forEach(p => {
                    if (p === Z80Assembler.OPERAND.IMM8 || p === Z80Assembler.OPERAND.RELATIVE) size += 1;
                    if (p === Z80Assembler.OPERAND.IMM16 || p === Z80Assembler.OPERAND.MEM16) size += 2;
                });
                return { ...inst, size };
            }
        }

        this._reportError(lineNum, `Invalid operand combination for '${mnemonic}': ${operands.join(', ')}`);
        return null;
    }
    
    /**
     * Generates machine code for a given instruction and its operands.
     * @param {object} instruction - The matched instruction definition.
     * @param {object} parsedLine - The parsed line object with actual operands.
     * @returns {number[]} An array of bytes for the instruction.
     */
    _generateInstructionBytes(instruction, parsedLine) {
        const bytes = [...instruction.opcodes];
        const symbols = this.symbols;
        let failed = false;

        instruction.operands.forEach((pattern, i) => {
            const operandStr = parsedLine.operands[i];
            
            switch (pattern) {
                case Z80Assembler.OPERAND.IMM8: {
                    const value = this._evaluateExpression(operandStr, symbols, parsedLine.lineNum);
                    if (isNaN(value)) {
                        this._reportError(parsedLine.lineNum, `Invalid 8-bit immediate: '${operandStr}'`);
                        failed = true;
                    } else if (value < -128 || value > 255) {
                        this._reportError(parsedLine.lineNum, `8-bit immediate value out of range (-128 to 255): ${value}`);
                        failed = true;
                    } else {
                        bytes.push(value & 0xFF);
                    }
                    break;
                }
                case Z80Assembler.OPERAND.IMM16: {
                    const value = this._evaluateExpression(operandStr, symbols, parsedLine.lineNum);
                    if (isNaN(value)) {
                        this._reportError(parsedLine.lineNum, `Invalid 16-bit immediate: '${operandStr}'`);
                        failed = true;
                    } else if (value < -32768 || value > 65535) {
                        this._reportError(parsedLine.lineNum, `16-bit immediate value out of range (-32768 to 65535): ${value}`);
                        failed = true;
                    } else {
                        bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
                    }
                    break;
                }
                case Z80Assembler.OPERAND.MEM8: {
                    // Extract value from inside parentheses, e.g., "(255)" for I/O port
                    const portStr = operandStr.slice(1, -1);
                    const value = this._evaluateExpression(portStr, symbols, parsedLine.lineNum);
                    if (isNaN(value)) {
                        this._reportError(parsedLine.lineNum, `Invalid 8-bit port address: '${operandStr}'`);
                        failed = true;
                    } else if (value < 0 || value > 255) {
                        this._reportError(parsedLine.lineNum, `8-bit port address out of range (0-255): ${value}`);
                        failed = true;
                    } else {
                        bytes.push(value & 0xFF);
                    }
                    break;
                }
                case Z80Assembler.OPERAND.MEM16: {
                    // Extract value from inside parentheses, e.g., "(1234)"
                    const addrStr = operandStr.slice(1, -1);
                    const value = this._evaluateExpression(addrStr, symbols, parsedLine.lineNum);
                    if (isNaN(value)) {
                        this._reportError(parsedLine.lineNum, `Invalid 16-bit address: '${operandStr}'`);
                        failed = true;
                    } else {
                        bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
                    }
                    break;
                }
                case Z80Assembler.OPERAND.RELATIVE: {
                    const targetAddr = this._evaluateExpression(operandStr, symbols, parsedLine.lineNum);
                    if (isNaN(targetAddr)) {
                        // Parse failed (undefined symbol already reported)
                        this._reportError(parsedLine.lineNum, `Invalid relative address: '${operandStr}'`);
                        failed = true;
                    } else {
                        // Relative offset is from the address *after* the instruction
                        if (this.currentAddress === undefined) {
                            this._reportError(parsedLine.lineNum, `Internal error: currentAddress undefined during relative jump calculation.`);
                            failed = true;
                        } else {
                            const offset = targetAddr - (this.currentAddress + instruction.size);
                            if (offset < -128 || offset > 127) {
                                this._reportError(parsedLine.lineNum, `Relative jump target out of range. Offset is ${offset}.`);
                                failed = true;
                            } else {
                                bytes.push(offset & 0xFF); // Two's complement representation
                            }
                        }
                    }
                    break;
                }
                default:
                    // Literal pattern (like 'A', '(HL)', 'BC') - no bytes needed
                    break;
            }
        });

        return failed ? [] : bytes;
    }


    /**
     * Evaluates basic arithmetic expressions with parentheses, +, -, *, /.
     * @param {string} expr - The expression to evaluate.
     * @param {object} symbols - Symbol table for label/equate lookup.
     * @returns {number} The evaluated result.
     */
    _evaluateExpression(expr, symbols, lineNum) {    
        const parser = new ExpressionParser(expr.trim(), [], symbols, lineNum, this);
        return parser.parseExpression();
    }
    
    // --- Helper methods for data directives (DB, DW, DS) ---

    _calculateDataSize(parsed) {
        const { mnemonic, operands } = parsed;
        if (mnemonic.toUpperCase() === 'DEFS') {
            return this._evaluateExpression(operands[0], this.symbols, parsed.lineNum);
        }

        let size = 0;
        for (const op of operands) {
            if (op.startsWith('"') && op.endsWith('"')) {
                size += op.length - 2; // Size is the character count
            } else {
                size += (mnemonic.toUpperCase() === 'DEFW' ? 2 : 1);
            }
        }
        return size;
    }

    _generateDataBytes(parsed) {
        let bytes = [];
        let failed = false;
        const symbols = this.symbols;
        for (const op of parsed.operands) {
            if (op.startsWith('"') && op.endsWith('"')) {
                const rawStr = op.slice(1, -1);
                const processedStr = this._processEscapeSequences(rawStr);
                for (let i = 0; i < processedStr.length; i++) {
                    bytes.push(processedStr.charCodeAt(i));
                }
            } else {
                const val = this._evaluateExpression(op, symbols, parsed.lineNum);
                if (isNaN(val)) {
                    this._reportError(parsed.lineNum, `Invalid byte value: '${op}'`);
                    failed = true;
                } else {
                    bytes.push(val & 0xFF);
                }
            }
        }
        return failed ? [] : bytes;
    }

    _generateDataWords(parsed) {
        let bytes = [];
        let failed = false;
        const symbols = this.symbols;
        for (const op of parsed.operands) {
             const value = this._evaluateExpression(op, symbols, parsed.lineNum);
             if (isNaN(value)) {
                 this._reportError(parsed.lineNum, `Invalid word value: '${op}'`);
                 failed = true;
             } else {
                 bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
             }
        }
        return failed ? [] : bytes;
    }

    /**
     * Populates the instruction map with Z80 instruction definitions.
     */
    _buildInstructionSet() {
        const { IMM8, IMM16, MEM8, MEM16, RELATIVE } = Z80Assembler.OPERAND;
        const definitions = [
            // Basic instructions
            { m: 'NOP', ops: [], opc: [0x00] },
            { m: 'HALT', ops: [], opc: [0x76] },
            
            // LD instructions
            { m: 'LD', ops: ['A', IMM8], opc: [0x3E] },
            { m: 'LD', ops: ['B', IMM8], opc: [0x06] },
            { m: 'LD', ops: ['C', IMM8], opc: [0x0E] },
            { m: 'LD', ops: ['D', IMM8], opc: [0x16] },
            { m: 'LD', ops: ['E', IMM8], opc: [0x1E] },
            { m: 'LD', ops: ['H', IMM8], opc: [0x26] },
            { m: 'LD', ops: ['L', IMM8], opc: [0x2E] },
            { m: 'LD', ops: ['A', MEM16], opc: [0x3A] },
            { m: 'LD', ops: [MEM16, 'A'], opc: [0x32] },
            { m: 'LD', ops: ['A', '(BC)'], opc: [0x0A] },
            { m: 'LD', ops: ['A', '(DE)'], opc: [0x1A] },
            { m: 'LD', ops: ['A', '(HL)'], opc: [0x7E] },
            { m: 'LD', ops: ['(BC)', 'A'], opc: [0x02] },
            { m: 'LD', ops: ['(DE)', 'A'], opc: [0x12] },
            { m: 'LD', ops: ['(HL)', 'A'], opc: [0x77] },
            { m: 'LD', ops: ['(HL)', 'B'], opc: [0x70] },
            { m: 'LD', ops: ['(HL)', 'C'], opc: [0x71] },
            { m: 'LD', ops: ['(HL)', 'D'], opc: [0x72] },
            { m: 'LD', ops: ['(HL)', 'E'], opc: [0x73] },
            { m: 'LD', ops: ['(HL)', 'H'], opc: [0x74] },
            { m: 'LD', ops: ['(HL)', 'L'], opc: [0x75] },
            { m: 'LD', ops: ['B', '(HL)'], opc: [0x46] },
            { m: 'LD', ops: ['E', 'A'], opc: [0x5F] },
            { m: 'LD', ops: ['A', 'E'], opc: [0x7B] },
            { m: 'LD', ops: ['A', 'C'], opc: [0x79] },
            { m: 'LD', ops: ['B', 'A'], opc: [0x47] },
            { m: 'LD', ops: ['C', 'A'], opc: [0x4F] },
            { m: 'LD', ops: ['B', 'C'], opc: [0x41] },
            { m: 'LD', ops: ['B', 'H'], opc: [0x44] },
            { m: 'LD', ops: ['A', 'B'], opc: [0x78] },
            { m: 'LD', ops: ['A', 'H'], opc: [0x7C] },
            { m: 'LD', ops: ['A', 'L'], opc: [0x7D] },
            { m: 'LD', ops: ['H', 'A'], opc: [0x67] },
            { m: 'LD', ops: ['L', 'A'], opc: [0x6F] },
            { m: 'LD', ops: ['A', 'D'], opc: [0x7A] },
            { m: 'LD', ops: ['D', 'A'], opc: [0x57] },
            // NOTE: 0xEB is EX DE,HL, not LD DE,HL. Keep EX mapping only.
            
            // Exchange instructions
            { m: 'EX', ops: ['AF', "AF'"], opc: [0x08] },
            { m: 'EX', ops: ['DE', 'HL'], opc: [0xEB] },
            
            { m: 'LD', ops: ['HL', IMM16], opc: [0x21] },
            { m: 'LD', ops: ['BC', IMM16], opc: [0x01] },
            { m: 'LD', ops: ['DE', IMM16], opc: [0x11] },
            { m: 'LD', ops: ['SP', IMM16], opc: [0x31] },
            { m: 'LD', ops: ['(HL)', IMM8], opc: [0x36] },

            // Control flow
            { m: 'CALL', ops: [IMM16], opc: [0xCD] },
            { m: 'RET', ops: [], opc: [0xC9] },
            { m: 'RET', ops: ['NZ'], opc: [0xC0] },
            { m: 'RET', ops: ['Z'], opc: [0xC8] },
            { m: 'RET', ops: ['NC'], opc: [0xD0] },
            { m: 'RET', ops: ['C'], opc: [0xD8] },
            { m: 'JR', ops: [RELATIVE], opc: [0x18] },
            { m: 'JR', ops: ['Z', RELATIVE], opc: [0x28] },
            { m: 'JR', ops: ['NZ', RELATIVE], opc: [0x20] },
            { m: 'JR', ops: ['C', RELATIVE], opc: [0x38] },
            { m: 'JR', ops: ['NC', RELATIVE], opc: [0x30] },
            { m: 'DJNZ', ops: [RELATIVE], opc: [0x10] },

            // Jumps
            { m: 'JP', ops: [IMM16], opc: [0xC3] },
            { m: 'JP', ops: ['Z', IMM16], opc: [0xCA] },
            { m: 'JP', ops: ['NZ', IMM16], opc: [0xC2] },
            { m: 'JP', ops: ['C', IMM16], opc: [0xDA] },
            { m: 'JP', ops: ['NC', IMM16], opc: [0xD2] },

            // Arithmetic
            { m: 'INC', ops: ['A'], opc: [0x3C] },
            { m: 'INC', ops: ['B'], opc: [0x04] },
            { m: 'INC', ops: ['C'], opc: [0x0C] },
            { m: 'INC', ops: ['D'], opc: [0x14] },
            { m: 'INC', ops: ['E'], opc: [0x1C] },
            { m: 'INC', ops: ['H'], opc: [0x24] },
            { m: 'INC', ops: ['L'], opc: [0x2C] },
            { m: 'INC', ops: ['BC'], opc: [0x03] },
            { m: 'INC', ops: ['DE'], opc: [0x13] },
            { m: 'INC', ops: ['HL'], opc: [0x23] },
            { m: 'INC', ops: ['SP'], opc: [0x33] },
            { m: 'INC', ops: ['(HL)'], opc: [0x34] },
            { m: 'DEC', ops: ['A'], opc: [0x3D] },
            { m: 'DEC', ops: ['B'], opc: [0x05] },
            { m: 'DEC', ops: ['C'], opc: [0x0D] },
            { m: 'DEC', ops: ['D'], opc: [0x15] },
            { m: 'DEC', ops: ['E'], opc: [0x1D] },
            { m: 'DEC', ops: ['H'], opc: [0x25] },
            { m: 'DEC', ops: ['L'], opc: [0x2D] },
            { m: 'DEC', ops: ['(HL)'], opc: [0x35] },
            { m: 'DEC', ops: ['BC'], opc: [0x0B] },
            { m: 'DEC', ops: ['DE'], opc: [0x1B] },
            { m: 'DEC', ops: ['HL'], opc: [0x2B] },
            { m: 'DEC', ops: ['SP'], opc: [0x3B] },
            { m: 'ADD', ops: ['HL', 'BC'], opc: [0x09] },
            { m: 'ADD', ops: ['HL', 'DE'], opc: [0x19] },
            { m: 'ADD', ops: ['HL', 'HL'], opc: [0x29] },
            { m: 'ADD', ops: ['HL', 'SP'], opc: [0x39] },
            { m: 'ADD', ops: ['A', 'A'], opc: [0x87] },
            { m: 'ADD', ops: ['A', 'B'], opc: [0x80] },
            { m: 'ADD', ops: ['A', 'C'], opc: [0x81] },
            { m: 'ADD', ops: ['A', 'D'], opc: [0x82] },
            { m: 'ADD', ops: ['A', 'E'], opc: [0x83] },
            { m: 'ADD', ops: ['A', 'H'], opc: [0x84] },
            { m: 'ADD', ops: ['A', 'L'], opc: [0x85] },
            { m: 'ADD', ops: ['A', IMM8], opc: [0xC6] },
            { m: 'ADC', ops: ['A', 'H'], opc: [0x8C] },
            { m: 'ADC', ops: ['A', IMM8], opc: [0xCE] },
            { m: 'SUB', ops: ['A'], opc: [0x97] },
            { m: 'SUB', ops: [IMM8], opc: [0xD6] },
            { m: 'SUB', ops: ['B'], opc: [0x90] },
            { m: 'SUB', ops: ['C'], opc: [0x91] },
            { m: 'SUB', ops: ['D'], opc: [0x92] },
            { m: 'SUB', ops: ['E'], opc: [0x93] },
            { m: 'SUB', ops: ['H'], opc: [0x94] },
            { m: 'SUB', ops: ['L'], opc: [0x95] },
            
            // Logic and comparison
            { m: 'CP', ops: [IMM8], opc: [0xFE] },
            { m: 'CP', ops: ['B'], opc: [0xB8] },
            { m: 'CP', ops: ['(HL)'], opc: [0xBE] },
            { m: 'OR', ops: ['A'], opc: [0xB7] },
            { m: 'OR', ops: ['B'], opc: [0xB0] },
            { m: 'OR', ops: ['C'], opc: [0xB1] },
            { m: 'OR', ops: ['D'], opc: [0xB2] },
            { m: 'OR', ops: ['E'], opc: [0xB3] },
            { m: 'OR', ops: ['H'], opc: [0xB4] },
            { m: 'OR', ops: ['L'], opc: [0xB5] },
            { m: 'OR', ops: ['(HL)'], opc: [0xB6] },
            { m: 'OR', ops: [IMM8], opc: [0xF6] },
            { m: 'XOR', ops: ['A'], opc: [0xAF] },
            { m: 'XOR', ops: [IMM8], opc: [0xEE] },
            { m: 'AND', ops: ['A'], opc: [0xA7] },
            { m: 'AND', ops: ['B'], opc: [0xA0] },
            { m: 'AND', ops: ['C'], opc: [0xA1] },
            { m: 'AND', ops: ['D'], opc: [0xA2] },
            { m: 'AND', ops: ['E'], opc: [0xA3] },
            { m: 'AND', ops: ['H'], opc: [0xA4] },
            { m: 'AND', ops: ['L'], opc: [0xA5] },
            { m: 'AND', ops: ['(HL)'], opc: [0xA6] },
            { m: 'AND', ops: [IMM8], opc: [0xE6] },
            { m: 'NEG', ops: [], opc: [0xED, 0x44] },
            
            // Rotate and shift
            { m: 'RLCA', ops: [], opc: [0x07] },
            
            // Flag operations
            { m: 'SCF', ops: [], opc: [0x37] },
            { m: 'CCF', ops: [], opc: [0x3F] },
            { m: 'CPL', ops: [], opc: [0x2F] },

            // Block operations
            { m: 'LDIR', ops: [], opc: [0xED, 0xB0] },

            // Stack operations
            { m: 'PUSH', ops: ['BC'], opc: [0xC5] },
            { m: 'PUSH', ops: ['DE'], opc: [0xD5] },
            { m: 'PUSH', ops: ['HL'], opc: [0xE5] },
            { m: 'PUSH', ops: ['AF'], opc: [0xF5] },
            { m: 'POP', ops: ['BC'], opc: [0xC1] },
            { m: 'POP', ops: ['DE'], opc: [0xD1] },
            { m: 'POP', ops: ['HL'], opc: [0xE1] },
            { m: 'POP', ops: ['AF'], opc: [0xF1] },
            
            // I/O operations
            { m: 'IN', ops: ['A', MEM8], opc: [0xDB] },
            { m: 'OUT', ops: [MEM8, 'A'], opc: [0xD3] },
            
            // Shift and rotate instructions
            { m: 'SLA', ops: ['A'], opc: [0xCB, 0x27] },
            { m: 'SLA', ops: ['B'], opc: [0xCB, 0x20] },
            { m: 'SLA', ops: ['C'], opc: [0xCB, 0x21] },
            { m: 'SLA', ops: ['D'], opc: [0xCB, 0x22] },
            { m: 'SLA', ops: ['E'], opc: [0xCB, 0x23] },
            { m: 'SLA', ops: ['H'], opc: [0xCB, 0x24] },
            { m: 'SLA', ops: ['L'], opc: [0xCB, 0x25] },
            { m: 'SLA', ops: ['(HL)'], opc: [0xCB, 0x26] },
            
            { m: 'SRA', ops: ['A'], opc: [0xCB, 0x2F] },
            { m: 'SRA', ops: ['B'], opc: [0xCB, 0x28] },
            { m: 'SRA', ops: ['C'], opc: [0xCB, 0x29] },
            { m: 'SRA', ops: ['D'], opc: [0xCB, 0x2A] },
            { m: 'SRA', ops: ['E'], opc: [0xCB, 0x2B] },
            { m: 'SRA', ops: ['H'], opc: [0xCB, 0x2C] },
            { m: 'SRA', ops: ['L'], opc: [0xCB, 0x2D] },
            { m: 'SRA', ops: ['(HL)'], opc: [0xCB, 0x2E] },
            
            { m: 'SRL', ops: ['A'], opc: [0xCB, 0x3F] },
            { m: 'SRL', ops: ['B'], opc: [0xCB, 0x38] },
            { m: 'SRL', ops: ['C'], opc: [0xCB, 0x39] },
            { m: 'SRL', ops: ['D'], opc: [0xCB, 0x3A] },
            { m: 'SRL', ops: ['E'], opc: [0xCB, 0x3B] },
            { m: 'SRL', ops: ['H'], opc: [0xCB, 0x3C] },
            { m: 'SRL', ops: ['L'], opc: [0xCB, 0x3D] },
            { m: 'SRL', ops: ['(HL)'], opc: [0xCB, 0x3E] },
            
            // Bit test instructions  
            { m: 'BIT', ops: ['0', 'A'], opc: [0xCB, 0x47] },
            { m: 'BIT', ops: ['1', 'A'], opc: [0xCB, 0x4F] },
            { m: 'BIT', ops: ['2', 'A'], opc: [0xCB, 0x57] },
            { m: 'BIT', ops: ['3', 'A'], opc: [0xCB, 0x5F] },
            { m: 'BIT', ops: ['4', 'A'], opc: [0xCB, 0x67] },
            { m: 'BIT', ops: ['5', 'A'], opc: [0xCB, 0x6F] },
            { m: 'BIT', ops: ['6', 'A'], opc: [0xCB, 0x77] },
            { m: 'BIT', ops: ['7', 'A'], opc: [0xCB, 0x7F] },
            { m: 'BIT', ops: ['7', 'E'], opc: [0xCB, 0x7B] },
            { m: 'BIT', ops: ['7', 'D'], opc: [0xCB, 0x7A] },
        ];

        definitions.forEach(def => {
            const mnemonic = def.m.toUpperCase();
            if (!this.instructionMap.has(mnemonic)) {
                this.instructionMap.set(mnemonic, []);
            }
            this.instructionMap.get(mnemonic).push({
                operands: def.ops,
                opcodes: def.opc
            });
        });
    }

    /**
     * Processes escape sequences in a string, converting them to their ASCII values.
     * @param {string} str - The string containing potential escape sequences.
     * @returns {string} The string with escape sequences converted to actual characters.
     */
    _processEscapeSequences(str) {
        let result = '';
        let i = 0;
        while (i < str.length) {
            if (str[i] === '\\' && i + 1 < str.length) {
                const escapeChar = str[i + 1];
                switch (escapeChar) {
                    case 'n': result += '\n'; break;      // newline (10)
                    case 't': result += '\t'; break;      // tab (9)
                    case 'r': result += '\r'; break;      // carriage return (13)
                    case '0': result += '\0'; break;      // null (0)
                    case '\\': result += '\\'; break;     // backslash (92)
                    case "'": result += "'"; break;       // single quote (39)
                    case '"': result += '"'; break;       // double quote (34)
                    default:
                        // Unknown escape sequence, keep the backslash and character
                        result += '\\' + escapeChar;
                        break;
                }
                i += 2; // Skip both the backslash and the escape character
            } else {
                result += str[i];
                i++;
            }
        }
        return result;
    }

    /**
     * Determines if an operand represents a memory reference vs immediate value with parentheses.
     * Memory reference: (expression) - entire operand wrapped in balanced parentheses
     * Immediate: expressions that may contain parentheses for mathematical grouping
     * Examples:
     *   (1+2)     -> memory reference (load from address 3)
     *   (1)+(2)   -> immediate value (arithmetic: 1+2=3)
     *   5+(3*2)   -> immediate value (arithmetic: 5+6=11)
     *   ($8000)   -> memory reference (load from address $8000)
     * @param {string} operand - The operand to analyze
     * @returns {boolean} True if operand is a memory reference, false if immediate
     */
    _isMemoryReference(operand) {
        if (!operand.startsWith('(') || !operand.endsWith(')')) {
            return false;
        }
        
        // Check if the entire operand is wrapped in balanced parentheses
        let depth = 0;
        let firstOpenFound = false;
        
        for (let i = 0; i < operand.length; i++) {
            if (operand[i] === '(') {
                depth++;
                if (!firstOpenFound) {
                    firstOpenFound = true;
                }
            } else if (operand[i] === ')') {
                depth--;
                // If we close the first opening paren before the end, it's not a pure memory ref
                if (firstOpenFound && depth === 0 && i < operand.length - 1) {
                    return false;
                }
            }
        }
        
        // Memory reference: entire operand is wrapped in parentheses
        // The first '(' should only be closed by the last ')'
        return depth === 0 && operand.startsWith('(') && operand.endsWith(')');
    }

    /**
     * Records an error with its line number.
     * @param {number} lineNum - The line number where the error occurred.
     * @param {string} message - The error description.
     */
    _reportError(lineNum, message) {
        this.errors.push({ line: lineNum, address: this.currentAddress || 0, message });
    }


    /**
     * Calculates CRC-16-CCITT for a byte array.
     * @param {number[]} bytes - The array of bytes to calculate CRC for.
     * @returns {number} The 16-bit CRC value.
     */
    _calculateCRC16(bytes) {
        let crc16 = 0xFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc16 ^= (bytes[i] << 8);
            for (let j = 0; j < 8; j++) {
                if (crc16 & 0x8000) {
                    crc16 = (crc16 << 1) ^ 0x1021;
                } else {
                    crc16 = crc16 << 1;
                }
                crc16 &= 0xFFFF; // Keep it 16-bit
            }
        }
        return crc16;
    }

    /**
     * Formats the machine code into a human-readable hex dump.
     * @param {number[]} machineCode - The array of bytes.
     * @param {number} loadAddress - The starting address for the display.
     * @returns {string} A formatted string representation of the machine code.
     */
    displayMachineCode(machineCode, loadAddress) {
        if (!machineCode || machineCode.length === 0) {
            return "No machine code generated.";
        }

        let output = "";
        const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

        for (let i = 0; i < machineCode.length; i += 8) {
            const rowBytes = machineCode.slice(i, i + 8);
            const address = loadAddress + i;

            // Calculate CRC16 for this line (address bytes + data bytes)
            const addressBytes = [address & 0xFF, (address >> 8) & 0xFF];
            const lineBytes = [...addressBytes, ...rowBytes];
            const lineCRC16 = this._calculateCRC16(lineBytes);

            // Address part (decimal)
            output += `${address} `;

            // Data column - decimal values separated by commas, plus line CRC16
            const decimalData = rowBytes.map(b => b.toString()).join(',');
            output += `Data ${decimalData},${lineCRC16}`;

            output += '\n';
        }

        return output;
    }
}

/**
 * Recursive descent parser for Z80 assembly expressions
 * Grammar:
 *   Expression := Term (('+'|'-') Term)*
 *   Term := Factor (('*'|'/') Factor)*
 *   Factor := Number | Symbol | '(' Expression ')' | '-' Factor | FunctionCall
 *   FunctionCall := Identifier '(' Expression ')'
 */
class ExpressionParser {
    constructor(expr, literals, symbols, lineNum, assembler) {
        this.expr = expr;
        this.literals = literals;
        this.symbols = symbols;
        this.lineNum = lineNum;
        this.assembler = assembler;
        this.pos = 0;
    }

    // Get current character
    peek() {
        return this.pos < this.expr.length ? this.expr[this.pos] : '';
    }

    // Advance position and return current character
    next() {
        return this.pos < this.expr.length ? this.expr[this.pos++] : '';
    }

    // Skip whitespace
    skipWhitespace() {
        while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n' || this.peek() === '\r') {
            this.next();
        }
    }

    // Parse a complete expression
    parseExpression() {
        try {
            const result = this.parseAddSubtract();
            if (this.pos < this.expr.length) {
                this.error(`Unexpected character '${this.peek()}' at position ${this.pos}`);
                return NaN;
            }
            return result;
        } catch (e) {
            this.error(e.message);
            return NaN;
        }
    }

    // Parse addition and subtraction (lowest precedence)
    parseAddSubtract() {
        this.skipWhitespace();
        let left = this.parseMultiplyDivide();
        
        this.skipWhitespace();
        while (this.peek() === '+' || this.peek() === '-') {
            const op = this.next();
            this.skipWhitespace();
            const right = this.parseMultiplyDivide();
            
            if (isNaN(left) || isNaN(right)) {
                throw new Error(`Invalid operands in expression`);
            }
            
            if (op === '+') {
                left = left + right;
            } else {
                left = left - right;
            }
            this.skipWhitespace();
        }
        
        return left;
    }

    // Parse multiplication and division (higher precedence)
    parseMultiplyDivide() {
        let left = this.parseFactor();
        
        this.skipWhitespace();
        while (this.peek() === '*' || this.peek() === '/') {
            const op = this.next();
            this.skipWhitespace();
            const right = this.parseFactor();
            
            if (isNaN(left) || isNaN(right)) {
                throw new Error(`Invalid operands in expression`);
            }
            
            if (op === '*') {
                left = left * right;
            } else {
                if (right === 0) {
                    throw new Error('Division by zero');
                }
                left = Math.floor(left / right);
            }
            this.skipWhitespace();
        }
        
        return left;
    }

    // Parse factors (highest precedence)
    parseFactor() {
        this.skipWhitespace();
        
        // Handle unary minus
        if (this.peek() === '-') {
            this.next();
            const factor = this.parseFactor();
            if (isNaN(factor)) {
                throw new Error('Invalid operand after unary minus');
            }
            return -factor;
        }
        
        // Handle parentheses
        if (this.peek() === '(') {
            this.next(); // consume '('
            this.skipWhitespace();
            const result = this.parseAddSubtract();
            this.skipWhitespace();
            if (this.peek() !== ')') {
                throw new Error(`Missing closing parenthesis, found '${this.peek()}' at position ${this.pos}`);
            }
            this.next(); // consume ')'
            return result;
        }
        
        // Handle function calls and identifiers
        if (this.isIdentifierStart(this.peek())) {
            return this.parseIdentifierOrFunction();
        }
        
        // Handle numbers
        if (this.isDigit(this.peek()) || this.peek() === '$' || this.peek() === '%' || this.peek() === '0') {
            return this.parseNumber();
        }
        
        // Handle character literals
        if (this.peek() === "'") {
            this.next(); // consume opening '
            if (this.peek() === "'") {
                throw new Error('Empty character literal');
            }
            
            let charContent = '';
            
            // Handle escape sequence
            if (this.peek() === '\\') {
                this.next(); // consume backslash
                const escapeChar = this.next(); // get escape character
                if (escapeChar === '') {
                    throw new Error('Unterminated escape sequence in character literal');
                }
                charContent = '\\' + escapeChar;
            } else {
                charContent = this.next(); // get regular character
            }
            
            if (this.peek() !== "'") {
                throw new Error('Unterminated character literal');
            }
            this.next(); // consume closing '
            
            // Process escape sequences and get the resulting character
            const processedChar = this.assembler._processEscapeSequences(charContent);
            if (processedChar.length !== 1) {
                throw new Error('Character literals must resolve to exactly one character');
            }
            return processedChar.charCodeAt(0);
        }
        
        // Handle string literals (not allowed in arithmetic expressions)
        if (this.peek() === '"') {
            throw new Error('String literals not allowed in arithmetic expressions');
        }
        
        throw new Error(`Unexpected character '${this.peek()}'`);
    }

    // Parse identifier or function call
    parseIdentifierOrFunction() {
        let identifier = '';
        while (this.isIdentifierChar(this.peek())) {
            identifier += this.next();
        }
        
        // Check if this might be a hex number with H suffix
        if (identifier.toUpperCase().endsWith('H')) {
            const hexPart = identifier.slice(0, -1);
            // Check if all characters except the H are valid hex digits
            if (hexPart.length > 0 && /^[0-9A-Fa-f]+$/.test(hexPart)) {
                const result = parseInt(hexPart, 16);
                if (!isNaN(result)) {
                    return result;
                }
            }
        }
        
        // Check if it's a function call
        if (this.peek() === '(') {
            this.next(); // consume '('
            
            if (identifier.toLowerCase() === 'len') {
                // For len(), we need the symbol name, not its value
                const symbolName = this.parseSymbolName();
                if (this.peek() !== ')') {
                    throw new Error('Missing closing parenthesis in function call');
                }
                this.next(); // consume ')'
                
                // Handle len() function
                return this.handleLenFunction(symbolName);
            } else if (identifier.toLowerCase() === 'chr') {
                // For chr(), we need to evaluate the expression
                this.skipWhitespace();
                const charCode = this.parseAddSubtract();
                this.skipWhitespace();
                if (this.peek() !== ')') {
                    throw new Error('Missing closing parenthesis in chr() function call');
                }
                this.next(); // consume ')'
                
                // Handle chr() function
                return this.handleChrFunction(charCode);
            } else {
                throw new Error(`Unknown function: ${identifier}`);
            }
        }
        
        // Regular symbol lookup
        return this.lookupSymbol(identifier);
    }

    // Parse symbol name for function arguments (don't evaluate, just return name)
    parseSymbolName() {
        if (!this.isIdentifierStart(this.peek())) {
            throw new Error('Expected symbol name');
        }
        
        let symbolName = '';
        while (this.isIdentifierChar(this.peek())) {
            symbolName += this.next();
        }
        
        return symbolName;
    }

    // Handle len() function
    handleLenFunction(symbolName) {
        if (typeof symbolName !== 'string') {
            throw new Error('len() function requires a symbol name');
        }
        
        const upperName = symbolName.toUpperCase();
        
        // Check if it's in the DB lengths dictionary
        if (upperName in this.assembler.dbLengths) {
            return this.assembler.dbLengths[upperName];
        }
        
        // Check if symbol exists at all
        const symbol = this.symbols[upperName];
        if (!symbol) {
            throw new Error(`Symbol '${symbolName}' not found`);
        }
        
        throw new Error(`Symbol '${symbolName}' is not a DB statement`);
    }

    // Handle chr() function
    handleChrFunction(charCode) {
        if (isNaN(charCode)) {
            throw new Error('chr() function requires a numeric argument');
        }
        
        // Ensure the character code is within valid ASCII range
        if (charCode < 0 || charCode > 255) {
            throw new Error(`chr() function argument out of range (0-255): ${charCode}`);
        }
        
        return Math.floor(charCode);
    }

    // Look up symbol value
    lookupSymbol(identifier) {
        const upperName = identifier.toUpperCase();
        
        
        // Regular symbol lookup
        const symbol = this.symbols[upperName];
        if (symbol !== undefined) {
            return symbol;
        }
        
        throw new Error(`Unknown symbol: '${identifier}'`);
    }

    // Parse numbers (decimal, hex, binary)
    parseNumber() {
        let numStr = '';
        let base = 10;
        
        // Handle hex prefix $
        if (this.peek() === '$') {
            this.next();
            base = 16;
            while (this.isHexDigit(this.peek())) {
                numStr += this.next();
            }
        }
        // Handle hex prefix 0x
        else if (this.peek() === '0' && this.pos + 1 < this.expr.length && this.expr[this.pos + 1].toLowerCase() === 'x') {
            this.next(); // consume '0'
            this.next(); // consume 'x'
            base = 16;
            while (this.isHexDigit(this.peek())) {
                numStr += this.next();
            }
        }
        // Handle binary prefix %
        else if (this.peek() === '%') {
            this.next();
            base = 2;
            while (this.peek() === '0' || this.peek() === '1') {
                numStr += this.next();
            }
        }
        // Handle decimal or hex suffix
        else {
            while (this.isAlphaNum(this.peek())) {
                numStr += this.next();
            }
            
            // Check for hex suffix H
            if (numStr.toUpperCase().endsWith('H')) {
                base = 16;
                numStr = numStr.slice(0, -1);
            }
        }
        
        if (numStr === '') {
            throw new Error('Invalid number format');
        }
        
        const result = parseInt(numStr, base);
        if (isNaN(result)) {
            throw new Error(`Invalid number: ${numStr}`);
        }
        
        return result;
    }

    // Helper functions
    isDigit(c) {
        return c >= '0' && c <= '9';
    }
    
    isHexDigit(c) {
        return this.isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
    }
    
    isAlpha(c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    }
    
    isAlphaNum(c) {
        return this.isAlpha(c) || this.isDigit(c);
    }
    
    isIdentifierStart(c) {
        return this.isAlpha(c) || c === '_';
    }
    
    isIdentifierChar(c) {
        return this.isAlphaNum(c) || c === '_';
    }
    
    // Report error through assembler
    error(message) {
        this.assembler._reportError(this.lineNum, message);
    }
}

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Z80Assembler;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
    window.Z80Assembler = Z80Assembler;
}
