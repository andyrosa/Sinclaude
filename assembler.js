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
     * @returns {{success: boolean, machineCode?: number[], loadAddress?: number, errors?: {line: number, message: string}[]}}
     *          An object indicating success or failure. On success, it includes the
     *          machine code and load address. On failure, it includes an array of errors.
     */
    assemble(sourceCode) {
        this.sourceLines = sourceCode.split('\n');
        this.symbols = {}; // Single symbol table for labels and constants
        this.dbLengths = {}; // Dictionary mapping DB symbol names to their string lengths
        this.errors = [];
        this.loadAddress = 0; // Default to address 0
        this.currentAddress = 0; // Default to address 0
        this.parsedLines = [];

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
        for (let i = 0; i < this.sourceLines.length; i++) {
            const lineNum = i + 1;
            const line = this.sourceLines[i];

            const parsed = this._parseLine(line, lineNum);
            if (!parsed) continue; // Skip empty/comment lines

            // Process ORG directive first to set addresses before processing labels
            if (parsed.mnemonic && parsed.mnemonic.toUpperCase() === 'ORG') {
                if (this.currentAddress !== 0) {
                    this._reportError(lineNum, `ORG directive can only be used when current address is zero. Current address is ${this.currentAddress}.`);
                    return;
                }
                this.loadAddress = this._parseValue(parsed.operands[0], lineNum, this.symbols);
                this.currentAddress = this.loadAddress;
            }

            this.parsedLines.push(parsed);

            // If the line has a label, record its current address (unless it's an EQU)
            if (parsed.label) {
                const mnemonic = parsed.mnemonic ? parsed.mnemonic.toUpperCase() : '';
                if (mnemonic !== 'EQU') {
                    if (this.symbols[parsed.label.toUpperCase()]) {
                        this._reportError(lineNum, `Duplicate label definition: '${parsed.label}'`);
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
                        } else {
                            this.symbols[parsed.label.toUpperCase()] = this._parseValue(parsed.operands[0], lineNum, this.symbols);
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
            const mnemonic = parsed.mnemonic ? parsed.mnemonic.toUpperCase() : '';
            
            // Skip directives that don't generate code
            if (!mnemonic || ['ORG', 'EQU', 'END'].includes(mnemonic)) {
                if (mnemonic === 'ORG') {
                    this.currentAddress = this._parseValue(parsed.operands[0], parsed.lineNum, this.symbols);
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
                    const size = this._parseValue(parsed.operands[0], parsed.lineNum, this.symbols);
                    const fill = parsed.operands.length > 1 ? this._parseValue(parsed.operands[1], parsed.lineNum, this.symbols) : 0;
                    bytes = Array(size).fill(fill & 0xFF);
                    break;
                default:
                    const instruction = this._resolveInstruction(parsed, parsed.lineNum);
                    if (instruction) {
                       bytes = this._generateInstructionBytes(instruction, parsed);
                    }
                    break;
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
        match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+(EQU)\s+(.*?)\s*(?:;.*)?$/);
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
                    const match = op.match(/^__STRING_PLACEHOLDER_(\d+)__$/);
                    return match ? placeholders[parseInt(match[1], 10)] : op;
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
                        // These patterns match non-parenthesized operands
                        return !operand.startsWith('(') || !operand.endsWith(')');
                    case Z80Assembler.OPERAND.MEM16:
                    case Z80Assembler.OPERAND.MEM8:
                        // These patterns match parenthesized operands like (1234)
                        return operand.startsWith('(') && operand.endsWith(')');
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

        instruction.operands.forEach((pattern, i) => {
            const operandStr = parsedLine.operands[i];
            
            switch (pattern) {
                case Z80Assembler.OPERAND.IMM8: {
                    const value = this._parseValue(operandStr, parsedLine.lineNum, symbols);
                    bytes.push(isNaN(value) ? 0 : (value & 0xFF));
                    break;
                }
                case Z80Assembler.OPERAND.IMM16: {
                    const value = this._parseValue(operandStr, parsedLine.lineNum, symbols);
                    if (isNaN(value)) {
                        bytes.push(0, 0);
                    } else {
                        bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
                    }
                    break;
                }
                case Z80Assembler.OPERAND.MEM16: {
                    // Extract value from inside parentheses, e.g., "(1234)"
                    const addrStr = operandStr.slice(1, -1);
                    const value = this._parseValue(addrStr, parsedLine.lineNum, symbols);
                    if (isNaN(value)) {
                        bytes.push(0, 0);
                    } else {
                        bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
                    }
                    break;
                }
                case Z80Assembler.OPERAND.RELATIVE: {
                    const targetAddr = this._parseValue(operandStr, parsedLine.lineNum, symbols);
                    if (isNaN(targetAddr)) {
                        // Parse failed (undefined symbol already reported)
                        bytes.push(0); // Push dummy value
                    } else {
                        // Relative offset is from the address *after* the instruction
                        if (this.currentAddress === undefined) {
                            this._reportError(parsedLine.lineNum, `Internal error: currentAddress undefined during relative jump calculation.`);
                            bytes.push(0);
                        } else {
                            const offset = targetAddr - (this.currentAddress + instruction.size);
                            if (offset < -128 || offset > 127) {
                                this._reportError(parsedLine.lineNum, `Relative jump target out of range. Offset is ${offset}.`);
                                bytes.push(0); // Push a dummy value
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

        return bytes;
    }


    /**
     * Parses a string representation of a value into a number.
     * Handles decimal, hex ($, 0x, h), binary (%), labels, and basic arithmetic expressions.
     * @param {string} valueStr - The string to parse.
     * @param {number} lineNum - The current line number for error reporting.
     * @param {object} symbols - A map of known symbols (labels, equates).
     * @returns {number} The parsed numeric value.
     */
    _parseValue(valueStr, lineNum, symbols) {
        // First try to evaluate as a simple expression with basic arithmetic
        const errorCountBefore = this.errors.length;
        const result = this._evaluateExpression(valueStr.trim(), symbols, lineNum);
        if (!isNaN(result)) {
            return result;
        }
        
        // If expression evaluation reported an error, don't try legacy parsing
        if (this.errors.length > errorCountBefore) {
            return NaN; // Return NaN to indicate parse failure (error already reported)
        }

        // Handle simple expressions like LABEL + 5 (legacy support)
        const parts = valueStr.split('+').map(p => p.trim());
        let total = 0;
        for (const part of parts) {
            const value = this._parseNumber(part, symbols, lineNum, 'Unknown symbol or invalid number format');
            if (isNaN(value)) {
                return NaN; // Error already reported by _parseNumber
            }
            total += value;
        }
        return total;
    }

    /**
     * Evaluates basic arithmetic expressions with parentheses, +, -, *, /.
     * @param {string} expr - The expression to evaluate.
     * @param {object} symbols - Symbol table for label/equate lookup.
     * @returns {number} The evaluated result.
     */
    _evaluateExpression(expr, symbols, lineNum) {
        // Remove all spaces
        expr = expr.replace(/\s+/g, '');
        
        // Handle parentheses first (recursive evaluation)
        // Skip function calls like len(...) - look for parentheses that are not preceded by a letter/underscore
        while (expr.includes('(')) {
            // Match parentheses that are not part of function calls (not preceded by word characters)
            const match = expr.match(/(?<![a-zA-Z_])\(([^()]+)\)/);
            if (!match) break;
            
            const subResult = this._evaluateExpression(match[1], symbols, lineNum);
            if (isNaN(subResult)) {
                this._reportError(lineNum, 'Invalid subexpression');
                return 0;
            }
            
            expr = expr.replace(match[0], subResult.toString());
        }
        
        // Now handle operators in order of precedence: *, / then +, -
        expr = this._evaluateOperators(expr, ['*', '/'], symbols, lineNum);
        expr = this._evaluateOperators(expr, ['+', '-'], symbols, lineNum);
        
        // Final result should be a single number or symbol
        return this._parseAtom(expr, symbols, lineNum);
    }
    
    /**
     * Evaluates operators of the same precedence level from left to right.
     */
    _evaluateOperators(expr, operators, symbols, lineNum) {
        for (const op of operators) {
            // Check if the operator exists outside of quotes
            let hasOperatorOutsideQuotes = false;
            let inSingleQuotes = false;
            let inDoubleQuotes = false;
            
            for (let i = 0; i < expr.length; i++) {
                const char = expr[i];
                if (char === "'" && !inDoubleQuotes) {
                    inSingleQuotes = !inSingleQuotes;
                } else if (char === '"' && !inSingleQuotes) {
                    inDoubleQuotes = !inDoubleQuotes;
                } else if (char === op && !inSingleQuotes && !inDoubleQuotes) {
                    hasOperatorOutsideQuotes = true;
                    break;
                }
            }
            
            if (!hasOperatorOutsideQuotes) continue; // Skip this operator if it's only inside quotes
            
            while (expr.includes(op)) {
                const regex = new RegExp(`([^+\\-*/]+)\\${op}([^+\\-*/]+)`);
                const match = expr.match(regex);
                if (!match) break;
                
                const left = this._parseAtom(match[1], symbols, lineNum);
                const right = this._parseAtom(match[2], symbols, lineNum);
                
                if (isNaN(left) || isNaN(right)) {
                    this._reportError(lineNum, 'Invalid operands in expression');
                    return expr;
                }
                
                let result;
                switch (op) {
                    case '+': result = left + right; break;
                    case '-': result = left - right; break;
                    case '*': result = left * right; break;
                    case '/': 
                        if (right === 0) {
                            this._reportError(lineNum, 'Division by zero in expression');
                            result = 0;
                        } else {
                            result = Math.floor(left / right);
                        }
                        break;
                    default: 
                        this._reportError(lineNum, `Unknown operator: ${op}`);
                        return expr;
                }
                
                expr = expr.replace(match[0], result.toString());
            }
        }
        return expr;
    }
    
    /**
     * Consolidated number parsing logic to eliminate duplication.
     * Handles decimal, hex ($, 0x, h), binary (%), and symbol lookup.
     */
    _parseNumber(numberStr, symbols, lineNum, errorMessagePrefix = 'Unknown symbol') {
        const trimmed = numberStr.trim();
        const upper = trimmed.toUpperCase();
        
        // Character literals (single quoted)
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            if (trimmed.length === 3) {
                // Single character: 'A', '[', etc.
                return trimmed.charCodeAt(1);
            } else if (trimmed.length === 2) {
                // Empty quotes: ''
                this._reportError(lineNum, `Empty character literal: '${trimmed}'`);
                return NaN;
            } else if (trimmed.length > 3) {
                // Multiple characters: 'AB'
                this._reportError(lineNum, `Character literal can only contain one character: '${trimmed}'`);
                return NaN;
            } else {
                // Unclosed quote: '
                this._reportError(lineNum, `Malformed character literal: '${trimmed}'`);
                return NaN;
            }
        }
        
        // Length function: len(symbol)
        if (trimmed.startsWith('len(') && trimmed.endsWith(')')) {
            const symbolName = trimmed.slice(4, -1).trim().toUpperCase();
            if (symbolName in this.dbLengths) {
                return this.dbLengths[symbolName];
            }
            this._reportError(lineNum, `len() function: symbol '${symbolName}' not found or not a DB statement`);
            return NaN;
        }
        
        // Symbol lookup
        if (upper in symbols) {
            return symbols[upper];
        }
        
        // Decimal numbers (including negative)
        if (/^-?[0-9]+$/.test(trimmed)) {
            return parseInt(trimmed, 10);
        }
        
        // Hex formats
        if (upper.startsWith('$')) {
            return parseInt(trimmed.substring(1), 16);
        }
        if (upper.startsWith('0X')) {
            return parseInt(trimmed.substring(2), 16);
        }
        if (upper.endsWith('H')) {
            return parseInt(trimmed.slice(0, -1), 16);
        }
        
        // Binary format
        if (trimmed.startsWith('%')) {
            return parseInt(trimmed.substring(1), 2);
        }
        
        // Unknown format
        this._reportError(lineNum, `${errorMessagePrefix}: '${trimmed}'`);
        return NaN;
    }

    /**
     * Parses a single atom (number, hex, binary, or symbol).
     */
    _parseAtom(atom, symbols, lineNum) {
        return this._parseNumber(atom, symbols, lineNum, 'Unknown symbol');
    }

    // --- Helper methods for data directives (DB, DW, DS) ---

    _calculateDataSize(parsed) {
        const { mnemonic, operands } = parsed;
        if (mnemonic.toUpperCase() === 'DEFS') {
            return this._parseValue(operands[0], parsed.lineNum, this.symbols);
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
        const symbols = this.symbols;
        for (const op of parsed.operands) {
            if (op.startsWith('"') && op.endsWith('"')) {
                const str = op.slice(1, -1);
                for (let i = 0; i < str.length; i++) {
                    bytes.push(str.charCodeAt(i));
                }
            } else {
                bytes.push(this._parseValue(op, parsed.lineNum, symbols) & 0xFF);
            }
        }
        return bytes;
    }

    _generateDataWords(parsed) {
        let bytes = [];
        const symbols = this.symbols;
        for (const op of parsed.operands) {
             const value = this._parseValue(op, parsed.lineNum, symbols);
             bytes.push(value & 0xFF, (value >> 8) & 0xFF); // Little-endian
        }
        return bytes;
    }

    /**
     * Populates the instruction map with Z80 instruction definitions.
     */
    _buildInstructionSet() {
        const { IMM8, IMM16, MEM16, RELATIVE } = Z80Assembler.OPERAND;
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
            { m: 'LD', ops: ['DE', 'HL'], opc: [0xEB] },
            
            // Exchange instructions
            { m: 'EX', ops: ['AF', "AF'"], opc: [0x08] },
            { m: 'EX', ops: ['DE', 'HL'], opc: [0xEB] },
            
            { m: 'LD', ops: ['HL', IMM16], opc: [0x21] },
            { m: 'LD', ops: ['BC', IMM16], opc: [0x01] },
            { m: 'LD', ops: ['DE', IMM16], opc: [0x11] },
            { m: 'LD', ops: ['SP', IMM16], opc: [0x31] },
            { m: 'LD', ops: ['(BC)', 'A'], opc: [0x02] },
            { m: 'LD', ops: ['(DE)', 'A'], opc: [0x12] },
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
            { m: 'SUB', ops: ['A', 'A'], opc: [0x97] }, // SUB A is shorthand for SUB A, A
            { m: 'SUB', ops: ['A', IMM8], opc: [0xD6] },
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
            
            // NEG instruction
            { m: 'NEG', ops: [], opc: [0xED, 0x44] },
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
// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Z80Assembler;
}
