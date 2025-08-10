// Z80 CPU Emulator
// Browser provides memory, all registers, and step count. Emulator executes instructions
class Z80CPU {
    constructor() {
        // Use reset to initialize to avoid code duplication
        this.reset();
    }

    // Reset CPU to initial state
    reset() {
        this.registers = {
            A: 0, B: 0, C: 0, D: 0, E: 0, H: 0, L: 0,
            PC: 0, SP: 0xFFFF,
            F: { Z: false, C: false }
        };
        this.shadowRegisters = {
            A: 0, F: { Z: false, C: false }
        };
        this.halted = false;
    }

    // Set CPU program counter and optionally stack pointer
    set(pc, sp = null) {
        this.registers.PC = this.adjustFFFF(pc);
        if (sp !== null) {
            this.registers.SP = this.adjustFFFF(sp);
        }
    }

    // regPairs register constants for register pairs
    static regPairs = {
        HL: ['H', 'L'],
        DE: ['D', 'E'], 
        BC: ['B', 'C'],
    };

    // Convert LSB/MSB register pair to 16-bit integer
    lsbMsbToWord(lsb, msb) {
        return (this.registers[msb] << 8) | this.registers[lsb];
    }

    // Get register pair value using regPairs register constant
    getReg(regPair) {
        const [msb, lsb] = regPair;
        return this.lsbMsbToWord(lsb, msb);
    }

    // Set register pair value using regPairs register constant  
    setReg(regPair, value) {
        const [msb, lsb] = regPair;
        this.registers[msb] = (value >> 8) & 0xFF;
        this.registers[lsb] = value & 0xFF;
    }

    /**
     * Executes Z80 instructions for the specified number of steps
     * @param {Uint8Array} memory - System memory array (64KB for Z80)
     * @param {Uint8Array} iomap - I/O port map for IN/OUT instructions (256 ports)
     * @param {number} steps - Maximum number of instructions to execute
     * @param {Object|null} initialRegisters - Optional register state to load before execution
     * @param {Object} initialRegisters.F - Flag register object with Z, C, N, H properties
     * @returns {Object} Execution result
     * @returns {number} returns.instructionsExecuted - Actual instructions completed
     * @returns {boolean} returns.halted - Whether CPU halted (HLT instruction)
     * @returns {Object} returns.registers - Final CPU register state
     * @returns {string|null} returns.error - Error message if execution failed
     */
    executeSteps(memory, iomap, steps, initialRegisters = null) {
        let instructionsExecuted = 0;
        let error = null;
        
        // Reset halted state when starting execution
        this.halted = false;        
       
        // Load initial registers if provided
        if (initialRegisters) {
            this.registers = { 
                ...initialRegisters,
                F: { ...initialRegisters.F } // Deep copy F register
            };
        }
        
        for (let i = 0; i < steps && !this.halted && !error; i++) {
            try {
                const result = this.executeInstruction(memory,iomap);
                if (result.error) {
                    error = result.error;
                    break;
                }
                instructionsExecuted++;
            } catch (e) {
                error = `CPU Exception: ${e.message}`;
                break;
            }
        }
        
        return {
            instructionsExecuted,
            halted: this.halted,
            registers: { 
                ...this.registers,
                F: { ...this.registers.F } // Deep copy F register
            },
            error
        };
    }

    // Basic CPU primitive: fetch byte from memory at PC and increment PC
    fetchByte() {
        const byte = this.memory[this.registers.PC];
        this.registers.PC = this.adjustFFFF(this.registers.PC + 1);
        return byte;
    }

    // Fetch 16-bit word (LSB first, then MSB) from memory at PC
    fetchWord() {
        const lsb = this.fetchByte();
        const msb = this.fetchByte();
        return lsb | (msb << 8);
    }

    // Pop 16-bit word from stack and set PC
    popPC() {
        this.registers.PC = this.memory[this.registers.SP] | (this.memory[this.registers.SP + 1] << 8);
        this.registers.SP = this.adjustFFFF(this.registers.SP + 2);
    }

    // Pop from stack returning [lsb, msb] pair
    popLSB_MSB() {
        const lsb = this.memory[this.registers.SP];
        this.registers.SP = this.adjustFFFF(this.registers.SP + 1);
        const msb = this.memory[this.registers.SP];
        this.registers.SP = this.adjustFFFF(this.registers.SP + 1);
        return [lsb, msb];
    }

    // Push [lsb, msb] pair to stack
    pushLSB_MSB(lsb, msb) {
        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
        this.memory[this.registers.SP] = msb;
        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
        this.memory[this.registers.SP] = lsb;
    }

    // Helper functions to adjust register values with proper overflow/underflow handling
    adjustFF(value) {
        return value & 0xFF;
    }
    
    adjustFFFF(value) {
        return value & 0xFFFF;
    }

    // Memory reading helper that doesn't modify state
    readWordFromMemory(memory, address) {
        const lsb = memory[address];
        const msb = memory[this.adjustFFFF(address + 1)];
        return (msb << 8) | lsb;
    }

    adjustFFPlusUpdateZC(result) {
        const adjustedValue = this.adjustFF(result);
        this.registers.F.Z = adjustedValue === 0;
        this.registers.F.C = result > 255 || result < 0;
        return adjustedValue;
    }

    adjustFFFFUpdateC(result) {
        this.registers.F.C = result > 0xFFFF;
        const adjustedValue = this.adjustFFFF(result);
        return adjustedValue;
    }

    updateIncrementFlags(register) {
        this.registers.F.Z = register === 0;
    }

    adjustFFPlusUpdateZ(result) {
        const adjustedValue = this.adjustFF(result);
        this.registers.F.Z = adjustedValue === 0;
        return adjustedValue;
    }

    updateLogicalFlags(value) {
        this.registers.F.Z = value === 0;
        this.registers.F.C = false;
    }

    updateAZC(value) {
        this.registers.A = value;
        this.registers.F.Z = value === 0;
        this.registers.F.C = false;
    }

    // Helper methods to consolidate common adjustFF patterns
    incrementSingleRegister(registerName) {
        this.registers[registerName] = this.adjustFFPlusUpdateZ(this.registers[registerName] + 1);
    }

    decrementSingleRegister(registerName) {
        this.registers[registerName] = this.adjustFFPlusUpdateZ(this.registers[registerName] - 1);
    }

    incrementMemoryUpdateZ(address) {
        this.memory[address] = this.adjustFFPlusUpdateZ(this.memory[address] + 1);
    }

    decrementMemoryUpdateZ(address) {
        this.memory[address] = this.adjustFFPlusUpdateZ(this.memory[address] - 1);
    }

    splitWordToRegisters(value, highReg, lowReg) {
        this.registers[highReg] = this.adjustFF(value >> 8);
        this.registers[lowReg] = this.adjustFF(value);
    }

    // Convert word to [lsb, msb] pair
    wordToLSB_MSB(value) {
        return [this.adjustFF(value), this.adjustFF(value >> 8)];
    }

    // Convenience methods for common register pair access to reduce duplication
    getHL() {
        return this.getReg(Z80CPU.regPairs.HL);
    }

    getBC() {
        return this.getReg(Z80CPU.regPairs.BC);
    }

    getDE() {
        return this.getReg(Z80CPU.regPairs.DE);
    }

    setHL(value) {
        this.setReg(Z80CPU.regPairs.HL, value);
    }

    setBC(value) {
        this.setReg(Z80CPU.regPairs.BC, value);
    }

    setDE(value) {
        this.setReg(Z80CPU.regPairs.DE, value);
    }

    // executes one Z80 instruction
    executeInstruction(memory,iomap) {
        // Store memory and iomap references for helper functions
        this.memory = memory;
        this.iomap = iomap;
        const instructionAddress = this.registers.PC;
        const opcode = this.fetchByte();
        
        switch(opcode) {
            case 0x00: // NOP
                // No operation - just continue
                break;
            case 0x08: // EX AF, AF'
                // Exchange AF with shadow AF'
                const tempA = this.registers.A;
                const tempF = { ...this.registers.F };
                this.registers.A = this.shadowRegisters.A;
                this.registers.F = { ...this.shadowRegisters.F };
                this.shadowRegisters.A = tempA;
                this.shadowRegisters.F = tempF;
                break;
            case 0x07: // RLCA
                // Rotate Left Circular Accumulator
                const bit7 = (this.registers.A & 0x80) >> 7;
                this.registers.A = this.adjustFF((this.registers.A << 1) | bit7);
                this.registers.F.C = bit7 !== 0;
                break;
            case 0x37: // SCF - Set Carry Flag
                this.registers.F.C = true;
                break;
            case 0x3F: // CCF - Complement Carry Flag
                this.registers.F.C = !this.registers.F.C;
                break;
            case 0x2F: // CPL - Complement accumulator
                this.registers.A = this.adjustFF(~this.registers.A);
                break;
            case 0x76: // HALT
                // Halt execution
                this.halted = true;
                break;
            case 0x3E: // LD A, n
                this.registers.A = this.fetchByte();
                break;
            case 0x32: // LD (nn), A
                memory[this.fetchWord()] = this.registers.A;
                break;
            case 0x3A: // LD A, (nn)
                this.registers.A = memory[this.fetchWord()];
                break;
            case 0xCD: // CALL nn
                {
                    const jump_address = this.fetchWord();
                    const [lsb, msb] = this.wordToLSB_MSB(this.registers.PC);
                    this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                    memory[this.registers.SP] = msb;
                    this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                    memory[this.registers.SP] = lsb;
                    this.registers.PC = jump_address;
                }
                break;
            case 0xC9: // RET
                this.popPC();
                break;
            case 0xC0: // RET NZ
                if (!this.registers.F.Z) {
                    this.popPC();
                }
                break;
            case 0xC8: // RET Z
                if (this.registers.F.Z) {
                    this.popPC();
                }
                break;
            case 0xD0: // RET NC
                if (!this.registers.F.C) {
                    this.popPC();
                }
                break;
            case 0xD8: // RET C
                if (this.registers.F.C) {
                    this.popPC();
                }
                break;
            case 0x18: // JR n
                const offset = this.fetchByte();
                const signedOffset = (offset > 127) ? offset - 256 : offset;
                this.registers.PC = this.adjustFFFF(this.registers.PC + signedOffset);
                break;
            case 0x21: // LD HL, nn
                this.registers.L = this.fetchByte();
                this.registers.H = this.fetchByte();
                break;
            case 0x36: // LD (HL), n
                memory[this.getHL()] = this.fetchByte();
                break;
            case 0x77: // LD (HL), A
                memory[this.getHL()] = this.registers.A;
                break;
            case 0x70: // LD (HL), B
                memory[this.getHL()] = this.registers.B;
                break;
            case 0x71: // LD (HL), C
                memory[this.getHL()] = this.registers.C;
                break;
            case 0x72: // LD (HL), D
                memory[this.getHL()] = this.registers.D;
                break;
            case 0x73: // LD (HL), E
                memory[this.getHL()] = this.registers.E;
                break;
            case 0x74: // LD (HL), H
                memory[this.getHL()] = this.registers.H;
                break;
            case 0x75: // LD (HL), L
                memory[this.getHL()] = this.registers.L;
                break;
            case 0x7E: // LD A, (HL)
                this.registers.A = memory[this.getHL()];
                break;
            case 0x0A: // LD A, (BC)
                this.registers.A = memory[this.getBC()];
                break;
            case 0x1A: // LD A, (DE)
                this.registers.A = memory[this.getDE()];
                break;
            
            // More LD instructions
            case 0x06: // LD B, n
                this.registers.B = this.fetchByte();
                break;
            case 0x0E: // LD C, n
                this.registers.C = this.fetchByte();
                break;
            case 0x16: // LD D, n
                this.registers.D = this.fetchByte();
                break;
            case 0x1E: // LD E, n
                this.registers.E = this.fetchByte();
                break;
            case 0x26: // LD H, n
                this.registers.H = this.fetchByte();
                break;
            case 0x2E: // LD L, n
                this.registers.L = this.fetchByte();
                break;
            case 0x46: // LD B, (HL)
                this.registers.B = memory[this.getHL()];
                break;
            case 0x5F: // LD E, A
                this.registers.E = this.registers.A;
                break;
            case 0x7B: // LD A, E
                this.registers.A = this.registers.E;
                break;
            case 0x79: // LD A, C
                this.registers.A = this.registers.C;
                break;
            case 0x47: // LD B, A
                this.registers.B = this.registers.A;
                break;
            case 0x4F: // LD C, A
                this.registers.C = this.registers.A;
                break;
            case 0x41: // LD B, C
                this.registers.B = this.registers.C;
                break;
            case 0x44: // LD B, H
                this.registers.B = this.registers.H;
                break;
            case 0x78: // LD A, B
                this.registers.A = this.registers.B;
                break;
            case 0x7C: // LD A, H
                this.registers.A = this.registers.H;
                break;
            case 0x7D: // LD A, L
                this.registers.A = this.registers.L;
                break;
            case 0x67: // LD H, A
                this.registers.H = this.registers.A;
                break;
            case 0x6F: // LD L, A
                this.registers.L = this.registers.A;
                break;
            case 0x7A: // LD A, D
                this.registers.A = this.registers.D;
                break;
            case 0x57: // LD D, A
                this.registers.D = this.registers.A;
                break;
            case 0xEB: // EX DE, HL
                const temp_D = this.registers.D;
                const temp_E = this.registers.E;
                this.registers.D = this.registers.H;
                this.registers.E = this.registers.L;
                this.registers.H = temp_D;
                this.registers.L = temp_E;
                break;
            case 0x31: // LD SP, nn
                this.registers.SP = this.fetchWord();
                break;
            case 0x01: // LD BC, nn
                this.registers.C = this.fetchByte();
                this.registers.B = this.fetchByte();
                break;
            case 0x02: // LD (BC), A
                memory[this.getBC()] = this.registers.A;
                break;
            case 0x11: // LD DE, nn
                this.registers.E = this.fetchByte();
                this.registers.D = this.fetchByte();
                break;
            case 0x12: // LD (DE), A
                memory[this.getDE()] = this.registers.A;
                break;
                
            // Arithmetic
            case 0x04: // INC B
                this.registers.B = this.adjustFFPlusUpdateZ(this.registers.B + 1);
                break;
            case 0x0C: // INC C
                this.registers.C = this.adjustFFPlusUpdateZ(this.registers.C + 1);
                break;
            case 0x14: // INC D
                this.registers.D = this.adjustFFPlusUpdateZ(this.registers.D + 1);
                break;
            case 0x1C: // INC E
                this.registers.E = this.adjustFFPlusUpdateZ(this.registers.E + 1);
                break;
            case 0x24: // INC H
                this.registers.H = this.adjustFFPlusUpdateZ(this.registers.H + 1);
                break;
            case 0x2C: // INC L
                this.registers.L = this.adjustFFPlusUpdateZ(this.registers.L + 1);
                break;
            case 0x3C: // INC A
                this.registers.A = this.adjustFFPlusUpdateZ(this.registers.A + 1);
                break;
            case 0x34: // INC (HL)
                this.incrementMemoryUpdateZ(this.getHL());
                break;
            case 0x3D: // DEC A
                this.registers.A = this.adjustFFPlusUpdateZ(this.registers.A - 1);
                break;
            case 0x05: // DEC B
                this.registers.B = this.adjustFFPlusUpdateZ(this.registers.B - 1);
                break;
            case 0x0D: // DEC C
                this.registers.C = this.adjustFFPlusUpdateZ(this.registers.C - 1);
                break;
            case 0x15: // DEC D
                this.registers.D = this.adjustFFPlusUpdateZ(this.registers.D - 1);
                break;
            case 0x1D: // DEC E
                this.registers.E = this.adjustFFPlusUpdateZ(this.registers.E - 1);
                break;
            case 0x25: // DEC H
                this.registers.H = this.adjustFFPlusUpdateZ(this.registers.H - 1);
                break;
            case 0x2D: // DEC L
                this.registers.L = this.adjustFFPlusUpdateZ(this.registers.L - 1);
                break;
            case 0x23: // INC HL
                this.setHL(this.adjustFFFF(this.getHL() + 1));
                break;
            case 0x33: // INC SP
                this.registers.SP = this.adjustFFFF(this.registers.SP + 1);
                break;
            case 0x03: // INC BC
                this.setBC(this.adjustFFFF(this.getBC() + 1));
                break;
            case 0x13: // INC DE
                this.setDE(this.adjustFFFF(this.getDE() + 1));
                break;
            case 0x0B: // DEC BC
                this.setBC(this.adjustFFFF(this.getBC() - 1));
                break;
            case 0x1B: // DEC DE
                this.setDE(this.adjustFFFF(this.getDE() - 1));
                break;
            case 0x2B: // DEC HL
                this.setHL(this.adjustFFFF(this.getHL() - 1));
                break;
            case 0x3B: // DEC SP
                this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                break;
            case 0x35: // DEC (HL)
                this.decrementMemoryUpdateZ(this.getHL());
                break;
            case 0x09: // ADD HL, BC
                this.setHL(this.adjustFFFFUpdateC(this.getHL() + this.getBC()));
                break;
            case 0x19: // ADD HL, DE
                this.setHL(this.adjustFFFFUpdateC(this.getHL() + this.getDE()));
                break;
            case 0x29: // ADD HL, HL
                this.setHL(this.adjustFFFFUpdateC(this.getHL() + this.getHL()));
                break;
            case 0x39: // ADD HL, SP
                this.setHL(this.adjustFFFFUpdateC(this.getHL() + this.registers.SP));
                break;
            case 0x80: // ADD A, B
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.B);
                break;
            case 0x81: // ADD A, C
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.C);
                break;
            case 0x82: // ADD A, D
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.D);
                break;
            case 0x83: // ADD A, E
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.E);
                break;
            case 0x84: // ADD A, H
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.H);
                break;
            case 0x87: // ADD A, A
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.A);
                break;
            case 0x85: // ADD A, L
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.L);
                break;
            case 0xC6: // ADD A, n
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.fetchByte());
                break;
            case 0x8C: // ADC A, H
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.registers.H + (this.registers.F.C ? 1 : 0));
                break;
            case 0xCE: // ADC A, n
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + this.fetchByte() + (this.registers.F.C ? 1 : 0));
                break;
            case 0x97: // SUB A
                this.registers.A = 0;
                this.registers.F.Z = true;
                this.registers.F.C = false;
                break;
            case 0x90: // SUB B
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.B);
                break;
            case 0x91: // SUB C
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.C);
                break;
            case 0x92: // SUB D
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.D);
                break;
            case 0x93: // SUB E
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.E);
                break;
            case 0x94: // SUB H
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.H);
                break;
            case 0x95: // SUB L
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.L);
                break;
            case 0xD6: // SUB A, n
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.fetchByte());
                break;
            case 0xD3: // OUT (n), A
                const outPort = this.fetchByte();
                this.PortOut(outPort, this.registers.A);
                break;
            case 0xDB: // IN A, (n)
                const inPort = this.fetchByte();
                this.registers.A = this.PortIn(inPort);
                break;
                
            // AND instructions
            case 0xA0: // AND B
                this.updateAZC(this.registers.A & this.registers.B);
                break;
            case 0xA1: // AND C
                this.updateAZC(this.registers.A & this.registers.C);
                break;
            case 0xA2: // AND D
                this.updateAZC(this.registers.A & this.registers.D);
                break;
            case 0xA3: // AND E
                this.updateAZC(this.registers.A & this.registers.E);
                break;
            case 0xA4: // AND H
                this.updateAZC(this.registers.A & this.registers.H);
                break;
            case 0xA5: // AND L
                this.updateAZC(this.registers.A & this.registers.L);
                break;
            case 0xA6: // AND (HL)
                this.updateAZC(this.registers.A & memory[this.getHL()]);
                break;
            case 0xA7: // AND A
                this.updateAZC(this.registers.A & this.registers.A);
                break;
                
            // Comparison and logic
            case 0xFE: // CP n
                const cpVal = this.fetchByte();
                this.registers.F.Z = this.registers.A === cpVal;
                this.registers.F.C = this.registers.A < cpVal;
                break;
            case 0xB8: // CP B
                this.registers.F.Z = this.registers.A === this.registers.B;
                this.registers.F.C = this.registers.A < this.registers.B;
                break;
            case 0xBE: // CP (HL)
                {
                    const hlValue = memory[this.getHL()];
                    this.registers.F.Z = this.registers.A === hlValue;
                    this.registers.F.C = this.registers.A < hlValue;
                }
                break;
            case 0xB7: // OR A
                this.updateAZC(this.registers.A);
                break;
            case 0xB0: // OR B
                this.updateAZC(this.registers.A | this.registers.B);
                break;
            case 0xB1: // OR C
                this.updateAZC(this.registers.A | this.registers.C);
                break;
            case 0xB2: // OR D
                this.updateAZC(this.registers.A | this.registers.D);
                break;
            case 0xB3: // OR E
                this.updateAZC(this.registers.A | this.registers.E);
                break;
            case 0xB4: // OR H
                this.updateAZC(this.registers.A | this.registers.H);
                break;
            case 0xB5: // OR L
                this.updateAZC(this.registers.A | this.registers.L);
                break;
            case 0xB6: // OR (HL)
                this.updateAZC(this.registers.A | memory[this.getHL()]);
                break;
            case 0xF6: // OR n
                this.updateAZC(this.registers.A | this.fetchByte());
                break;
            case 0xAF: // XOR A
                this.updateAZC(0);
                break;
            case 0xEE: // XOR n
                this.updateAZC(this.registers.A ^ this.fetchByte());
                break;
            case 0xE6: // AND n
                this.updateAZC(this.registers.A & this.fetchByte());
                break;
                
            // Conditional jumps
            case 0x28: // JR Z, n
                const jrZOffset = this.fetchByte();
                if (this.registers.F.Z) {
                    this.registers.PC += (jrZOffset > 127) ? jrZOffset - 256 : jrZOffset;
                }
                break;
            case 0x20: // JR NZ, n
                const jrNzOffset = this.fetchByte();
                if (!this.registers.F.Z) {
                    this.registers.PC += (jrNzOffset > 127) ? jrNzOffset - 256 : jrNzOffset;
                }
                break;
            case 0x38: // JR C, n
                const jrCOffset = this.fetchByte();
                if (this.registers.F.C) {
                    this.registers.PC += (jrCOffset > 127) ? jrCOffset - 256 : jrCOffset;
                }
                break;
            case 0x30: // JR NC, n
                const jrNCOffset = this.fetchByte();
                if (!this.registers.F.C) {
                    this.registers.PC += (jrNCOffset > 127) ? jrNCOffset - 256 : jrNCOffset;
                }
                break;
            case 0x10: // DJNZ n
                this.registers.B = (this.registers.B - 1) & 0xFF;
                const djnzOffset = this.fetchByte();
                if (this.registers.B !== 0) {
                    this.registers.PC += (djnzOffset > 127) ? djnzOffset - 256 : djnzOffset;
                }
                break;
            case 0xCA: // JP Z, nn
                const jpZAddr = this.fetchWord();
                if (this.registers.F.Z) {
                    this.registers.PC = jpZAddr;
                }
                break;
            case 0xC2: // JP NZ, nn
                const jpNzAddr = this.fetchWord();
                if (!this.registers.F.Z) {
                    this.registers.PC = jpNzAddr;
                }
                break;
            case 0xDA: // JP C, nn
                const jpCAddr = this.fetchWord();
                if (this.registers.F.C) {
                    this.registers.PC = jpCAddr;
                }
                break;
            case 0xD2: // JP NC, nn
                const jpNCAddr = this.fetchWord();
                if (!this.registers.F.C) {
                    this.registers.PC = jpNCAddr;
                }
                break;
            case 0xC3: // JP nn
                this.registers.PC = this.fetchWord();
                break;
                
            // Stack operations
            case 0xC5: // PUSH BC
                this.pushLSB_MSB(this.registers.C, this.registers.B);
                break;
            case 0xC1: // POP BC
                [this.registers.C, this.registers.B] = this.popLSB_MSB();
                break;
            case 0xD5: // PUSH DE
                this.pushLSB_MSB(this.registers.E, this.registers.D);
                break;
            case 0xE5: // PUSH HL
                this.pushLSB_MSB(this.registers.L, this.registers.H);
                break;
            case 0xF5: // PUSH AF
                // Create proper F register encoding - Z80 flag register format
                // Bit 7: S (sign), Bit 6: Z (zero), Bit 5: unused, Bit 4: H (half-carry) 
                // Bit 3: unused, Bit 2: P/V (parity/overflow), Bit 1: N (subtract), Bit 0: C (carry)
                const flagByte = (this.registers.F.Z ? 0x40 : 0) | (this.registers.F.C ? 0x01 : 0);
                this.pushLSB_MSB(flagByte, this.registers.A);
                break;
            case 0xD1: // POP DE
                [this.registers.E, this.registers.D] = this.popLSB_MSB();
                break;
            case 0xE1: // POP HL
                [this.registers.L, this.registers.H] = this.popLSB_MSB();
                break;
            case 0xF1: // POP AF
                const [flags, aReg] = this.popLSB_MSB();
                this.registers.A = aReg;
                this.registers.F.Z = (flags & 0x40) !== 0;
                this.registers.F.C = (flags & 0x01) !== 0;
                break;
                
            // Extended instructions (0xED prefix)
            case 0xED:
                const extOpcode = this.fetchByte();
                switch(extOpcode) {
                    case 0x44: // NEG
                        this.registers.A = this.adjustFFPlusUpdateZC(0 - this.registers.A);
                        break;
                    case 0xB0: // LDIR
                        let hl = this.getHL();
                        let de = this.getDE();
                        let bc = this.getBC();
                        
                        while (bc > 0) {
                            // Copy byte from (HL) to (DE)
                            memory[de] = memory[hl];
                            
                            // Increment HL and DE
                            hl = this.adjustFFFF(hl + 1);
                            de = this.adjustFFFF(de + 1);
                            
                            // Decrement BC
                            bc = this.adjustFFFF(bc - 1);
                        }
                        
                        // Update registers with final values
                        this.setHL(hl);
                        this.setDE(de);
                        this.setBC(bc);
                        break;
                    default:
                        const extErrorMsg = `Unknown extended opcode: 0xED 0x${extOpcode.toString(16).padStart(2, '0')} at address 0x${(this.registers.PC - 2).toString(16).padStart(4, '0')}`;
                        return { error: extErrorMsg };
                }
                break;
                
            case 0xCB: // CB prefix - shift and bit instructions
                const cbOpcode = this.fetchByte();
                this.executeCBInstruction(cbOpcode);
                break;
                
            default:
                // Return error for unknown instructions
                const errorMsg = `Unknown opcode: 0x${opcode.toString(16).padStart(2, '0')} at address 0x${instructionAddress.toString(16).padStart(4, '0')}`;
                return { error: errorMsg };
                break;
        }
        this.registers.PC &= 0xFFFF;
        return {}; // Success - no error
    }
    
    // CB-prefixed instructions (shift and bit operations)
    executeCBInstruction(cbOpcode) {
        switch(cbOpcode) {
            // SLA (Shift Left Arithmetic) instructions
            case 0x20: this.registers.B = this.shiftLeftArithmetic(this.registers.B); break;
            case 0x21: this.registers.C = this.shiftLeftArithmetic(this.registers.C); break;
            case 0x22: this.registers.D = this.shiftLeftArithmetic(this.registers.D); break;
            case 0x23: this.registers.E = this.shiftLeftArithmetic(this.registers.E); break;
            case 0x24: this.registers.H = this.shiftLeftArithmetic(this.registers.H); break;
            case 0x25: this.registers.L = this.shiftLeftArithmetic(this.registers.L); break;
            case 0x26: this.shiftLeftArithmeticAtHL(); break;
            case 0x27: this.registers.A = this.shiftLeftArithmetic(this.registers.A); break;
            
            // SRA (Shift Right Arithmetic) instructions
            case 0x28: this.registers.B = this.shiftRightArithmetic(this.registers.B); break;
            case 0x29: this.registers.C = this.shiftRightArithmetic(this.registers.C); break;
            case 0x2A: this.registers.D = this.shiftRightArithmetic(this.registers.D); break;
            case 0x2B: this.registers.E = this.shiftRightArithmetic(this.registers.E); break;
            case 0x2C: this.registers.H = this.shiftRightArithmetic(this.registers.H); break;
            case 0x2D: this.registers.L = this.shiftRightArithmetic(this.registers.L); break;
            case 0x2E: this.shiftRightArithmeticAtHL(); break;
            case 0x2F: this.registers.A = this.shiftRightArithmetic(this.registers.A); break;
            
            // SRL (Shift Right Logical) instructions
            case 0x38: this.registers.B = this.shiftRightLogical(this.registers.B); break;
            case 0x39: this.registers.C = this.shiftRightLogical(this.registers.C); break;
            case 0x3A: this.registers.D = this.shiftRightLogical(this.registers.D); break;
            case 0x3B: this.registers.E = this.shiftRightLogical(this.registers.E); break;
            case 0x3C: this.registers.H = this.shiftRightLogical(this.registers.H); break;
            case 0x3D: this.registers.L = this.shiftRightLogical(this.registers.L); break;
            case 0x3E: this.shiftRightlogicalAtHL(); break;
            case 0x3F: this.registers.A = this.shiftRightLogical(this.registers.A); break;
            
            // BIT test instructions (test bit 7)
            case 0x47: this.testBit(0, this.registers.A); break;
            case 0x4F: this.testBit(1, this.registers.A); break;
            case 0x57: this.testBit(2, this.registers.A); break;
            case 0x5F: this.testBit(3, this.registers.A); break;
            case 0x67: this.testBit(4, this.registers.A); break;
            case 0x6F: this.testBit(5, this.registers.A); break;
            case 0x77: this.testBit(6, this.registers.A); break;
            case 0x7F: this.testBit(7, this.registers.A); break;
            case 0x7B: this.testBit(7, this.registers.E); break;
            case 0x7A: this.testBit(7, this.registers.D); break;
            
            default:
                return { error: `Unknown CB opcode: 0xCB 0x${cbOpcode.toString(16).padStart(2, '0')} at address 0x${(this.registers.PC - 2).toString(16).padStart(4, '0')}` };
        }
    }
    
    // Helper methods for shift operations
    shiftLeftArithmetic(value) {
        this.registers.F.C = (value & 0x80) !== 0;  // Save bit 7 to carry
        const result = (value << 1) & 0xFF;
        this.registers.F.Z = result === 0;
        return result;
    }
    
    shiftLeftArithmeticAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x80) !== 0;
        this.memory[addr] = (value << 1) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    shiftRightArithmetic(value) {
        this.registers.F.C = (value & 0x01) !== 0;  // Save bit 0 to carry
        const result = ((value >> 1) | (value & 0x80)) & 0xFF;  // Preserve sign bit
        this.registers.F.Z = result === 0;
        return result;
    }
    
    shiftRightArithmeticAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x01) !== 0;
        this.memory[addr] = ((value >> 1) | (value & 0x80)) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    shiftRightLogical(value) {
        this.registers.F.C = (value & 0x01) !== 0;  // Save bit 0 to carry
        const result = (value >> 1) & 0xFF;  // No sign preservation
        this.registers.F.Z = result === 0;
        return result;
    }
    
    shiftRightlogicalAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x01) !== 0;
        this.memory[addr] = (value >> 1) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    testBit(bit, value) {
        const bitMask = 1 << bit;
        this.registers.F.Z = (value & bitMask) === 0;
    }

    // I/O Port handling - use stored iomap
    PortOut(port, value) {
      this.iomap[port] = value;
    }

    PortIn(port) {
      return this.iomap[port];
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Z80CPU;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
    window.Z80CPU = Z80CPU;
}
