// Z80 CPU Emulator
// Browser provides memory, all registers, and step count. Emulator executes instructions
//
// IMPLEMENTED INSTRUCTIONS: NOP; EX AF,AF'; RLCA; SCF; CCF; CPL; HALT; LD A,n; LD (nn),A; LD A,(nn);
// CALL nn; CALL Z,nn; CALL NZ,nn; CALL C,nn; CALL NC,nn; RET; RET NZ; RET Z; RET NC; RET C; 
// JR d; JP nn; JP (HL); LD HL,nn; LD (nn),HL; LD HL,(nn); LD (HL),n; LD (HL),A; LD (HL),B;
// LD (HL),C; LD (HL),D; LD (HL),E; LD (HL),H; LD (HL),L; LD A,(HL); LD A,(BC); LD A,(DE);
// LD B,n; LD C,n; LD D,n; LD E,n; LD H,n; LD L,n; LD B,(HL); LD C,(HL); LD D,(HL); LD E,(HL);
// LD H,(HL); LD L,(HL); LD E,A; LD A,E; LD A,C; LD B,A; LD C,A; LD B,C; LD B,H; LD A,B; LD A,H; 
// LD A,L; LD H,A; LD L,A; LD A,D; LD D,A; LD B,B; LD B,D; LD B,E; LD B,L; LD C,B; LD C,C; LD C,D;
// LD C,E; LD C,H; LD C,L; LD D,B; LD D,C; LD D,D; LD D,E; LD D,H; LD D,L; LD E,B; LD E,C; LD E,D;
// LD E,E; LD E,H; LD E,L; LD H,B; LD H,C; LD H,D; LD H,E; LD H,H; LD H,L; LD L,B; LD L,C; LD L,D;
// LD L,E; LD L,H; LD L,L; EX DE,HL; EX (SP),HL; LD SP,nn; LD BC,nn; LD (BC),A; LD DE,nn; LD (DE),A; 
// INC B; INC C; INC D; INC E; INC H; INC L; INC A; INC (HL); DEC A; DEC B; DEC C; DEC D; DEC E; 
// DEC H; DEC L; INC HL; INC SP; INC BC; INC DE; DEC BC; DEC DE; DEC HL; DEC SP; DEC (HL); 
// ADD HL,BC; ADD HL,DE; ADD HL,HL; ADD HL,SP; ADD A,B; ADD A,C; ADD A,D; ADD A,E; ADD A,H; ADD A,A; 
// ADD A,L; ADD A,n; ADD A,(HL); ADC A,H; ADC A,n; SUB A; SUB B; SUB C; SUB D; SUB E; SUB H; SUB L; 
// SUB n; SUB (HL); OUT (n),A; IN A,(n); AND B; AND C; AND D; AND E; AND H; AND L; AND (HL); AND A; 
// CP n; CP B; CP C; CP D; CP E; CP H; CP L; CP (HL); CP A; OR A; OR B; OR C; OR D; OR E; OR H; OR L; 
// OR (HL); OR n; XOR A; XOR B; XOR C; XOR D; XOR E; XOR H; XOR L; XOR (HL); XOR n; AND n; JR Z,d; 
// JR NZ,d; JR C,d; JR NC,d; DJNZ d; JP Z,nn; JP NZ,nn; JP C,nn; JP NC,nn; PUSH BC; POP BC; PUSH DE; 
// PUSH HL; PUSH AF; POP DE; POP HL; POP AF; NEG; LDIR; SLA B; SLA C; SLA D; SLA E; SLA H; SLA L;
// SLA (HL); SLA A; SRA B; SRA C; SRA D; SRA E; SRA H; SRA L; SRA (HL); SRA A; SRL B; SRL C;
// SRL D; SRL E; SRL H; SRL L; SRL (HL); SRL A; RLA; RRCA; RRA; RLC A; RLC B; RLC C; RLC D; RLC E;
// RLC H; RLC L; RLC (HL); RRC A; RRC B; RRC C; RRC D; RRC E; RRC H; RRC L; RRC (HL); RL A; RL B;
// RL C; RL D; RL E; RL H; RL L; RL (HL); RR A; RR B; RR C; RR D; RR E; RR H; RR L; RR (HL);
// SBC A,A; SBC A,B; SBC A,C; SBC A,D; SBC A,E; SBC A,H; SBC A,L; SBC A,(HL); SBC A,n; SET 0,A;
// SET 0,B; SET 0,C; SET 0,D; SET 0,E; SET 0,H; SET 0,L; SET 0,(HL); SET 1,A; SET 1,B; SET 1,C;
// SET 1,D; SET 1,E; SET 1,H; SET 1,L; SET 1,(HL); SET 7,A; SET 7,B; SET 7,C; SET 7,D; SET 7,E;
// SET 7,H; SET 7,L; SET 7,(HL); RES 0,A; RES 0,B; RES 0,C; RES 0,D; RES 0,E; RES 0,H; RES 0,L;
// RES 0,(HL); RES 1,A; RES 1,B; RES 1,C; RES 1,D; RES 1,E; RES 1,H; RES 1,L; RES 1,(HL);
// RES 7,A; RES 7,B; RES 7,C; RES 7,D; RES 7,E; RES 7,H; RES 7,L; RES 7,(HL); BIT 0,A; BIT 1,A;
// BIT 2,A; BIT 3,A; BIT 4,A; BIT 5,A; BIT 6,A; BIT 7,A; BIT 7,E; BIT 7,D
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
            case 0x0F: // RRCA
                // Rotate Right Circular Accumulator
                const bit0 = this.registers.A & 0x01;
                this.registers.A = this.adjustFF((this.registers.A >> 1) | (bit0 << 7));
                this.registers.F.C = bit0 !== 0;
                break;
            case 0x17: // RLA
                // Rotate Left Accumulator through carry
                const oldCarry = this.registers.F.C ? 1 : 0;
                const newCarry = (this.registers.A & 0x80) !== 0;
                this.registers.A = this.adjustFF((this.registers.A << 1) | oldCarry);
                this.registers.F.C = newCarry;
                break;
            case 0x1F: // RRA
                // Rotate Right Accumulator through carry
                const oldCarryRRA = this.registers.F.C ? 0x80 : 0;
                const newCarryRRA = (this.registers.A & 0x01) !== 0;
                this.registers.A = this.adjustFF((this.registers.A >> 1) | oldCarryRRA);
                this.registers.F.C = newCarryRRA;
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
            case 0x22: // LD (nn), HL
                {
                    const addr = this.fetchWord();
                    memory[addr] = this.registers.L;
                    memory[this.adjustFFFF(addr + 1)] = this.registers.H;
                }
                break;
            case 0x2A: // LD HL, (nn)
                {
                    const addr = this.fetchWord();
                    this.registers.L = memory[addr];
                    this.registers.H = memory[this.adjustFFFF(addr + 1)];
                }
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
            
            // Additional register-to-register LD variants
            case 0x40: // LD B, B
                this.registers.B = this.registers.B;
                break;
            case 0x42: // LD B, D
                this.registers.B = this.registers.D;
                break;
            case 0x43: // LD B, E
                this.registers.B = this.registers.E;
                break;
            case 0x45: // LD B, L
                this.registers.B = this.registers.L;
                break;
            case 0x48: // LD C, B
                this.registers.C = this.registers.B;
                break;
            case 0x49: // LD C, C
                this.registers.C = this.registers.C;
                break;
            case 0x4A: // LD C, D
                this.registers.C = this.registers.D;
                break;
            case 0x4B: // LD C, E
                this.registers.C = this.registers.E;
                break;
            case 0x4C: // LD C, H
                this.registers.C = this.registers.H;
                break;
            case 0x4D: // LD C, L
                this.registers.C = this.registers.L;
                break;
            case 0x4E: // LD C, (HL)
                this.registers.C = memory[this.getHL()];
                break;
            case 0x50: // LD D, B
                this.registers.D = this.registers.B;
                break;
            case 0x51: // LD D, C
                this.registers.D = this.registers.C;
                break;
            case 0x52: // LD D, D
                this.registers.D = this.registers.D;
                break;
            case 0x53: // LD D, E
                this.registers.D = this.registers.E;
                break;
            case 0x54: // LD D, H
                this.registers.D = this.registers.H;
                break;
            case 0x55: // LD D, L
                this.registers.D = this.registers.L;
                break;
            case 0x56: // LD D, (HL)
                this.registers.D = memory[this.getHL()];
                break;
            case 0x58: // LD E, B
                this.registers.E = this.registers.B;
                break;
            case 0x59: // LD E, C
                this.registers.E = this.registers.C;
                break;
            case 0x5A: // LD E, D
                this.registers.E = this.registers.D;
                break;
            case 0x5B: // LD E, E
                this.registers.E = this.registers.E;
                break;
            case 0x5C: // LD E, H
                this.registers.E = this.registers.H;
                break;
            case 0x5D: // LD E, L
                this.registers.E = this.registers.L;
                break;
            case 0x5E: // LD E, (HL)
                this.registers.E = memory[this.getHL()];
                break;
            case 0x60: // LD H, B
                this.registers.H = this.registers.B;
                break;
            case 0x61: // LD H, C
                this.registers.H = this.registers.C;
                break;
            case 0x62: // LD H, D
                this.registers.H = this.registers.D;
                break;
            case 0x63: // LD H, E
                this.registers.H = this.registers.E;
                break;
            case 0x64: // LD H, H
                this.registers.H = this.registers.H;
                break;
            case 0x65: // LD H, L
                this.registers.H = this.registers.L;
                break;
            case 0x66: // LD H, (HL)
                this.registers.H = memory[this.getHL()];
                break;
            case 0x68: // LD L, B
                this.registers.L = this.registers.B;
                break;
            case 0x69: // LD L, C
                this.registers.L = this.registers.C;
                break;
            case 0x6A: // LD L, D
                this.registers.L = this.registers.D;
                break;
            case 0x6B: // LD L, E
                this.registers.L = this.registers.E;
                break;
            case 0x6C: // LD L, H
                this.registers.L = this.registers.H;
                break;
            case 0x6D: // LD L, L
                this.registers.L = this.registers.L;
                break;
            case 0x6E: // LD L, (HL)
                this.registers.L = memory[this.getHL()];
                break;
            case 0xEB: // EX DE, HL
                const temp_D = this.registers.D;
                const temp_E = this.registers.E;
                this.registers.D = this.registers.H;
                this.registers.E = this.registers.L;
                this.registers.H = temp_D;
                this.registers.L = temp_E;
                break;
            case 0xE3: // EX (SP), HL
                {
                    const sp = this.registers.SP;
                    const temp_L = this.registers.L;
                    const temp_H = this.registers.H;
                    this.registers.L = memory[sp];
                    this.registers.H = memory[this.adjustFFFF(sp + 1)];
                    memory[sp] = temp_L;
                    memory[this.adjustFFFF(sp + 1)] = temp_H;
                }
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
            case 0x86: // ADD A, (HL)
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A + memory[this.getHL()]);
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
            case 0x96: // SUB (HL)
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - memory[this.getHL()]);
                break;
            
            // SBC (Subtract with Carry) instructions
            case 0x9F: // SBC A, A
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.A - (this.registers.F.C ? 1 : 0));
                break;
            case 0x98: // SBC A, B
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.B - (this.registers.F.C ? 1 : 0));
                break;
            case 0x99: // SBC A, C
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.C - (this.registers.F.C ? 1 : 0));
                break;
            case 0x9A: // SBC A, D
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.D - (this.registers.F.C ? 1 : 0));
                break;
            case 0x9B: // SBC A, E
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.E - (this.registers.F.C ? 1 : 0));
                break;
            case 0x9C: // SBC A, H
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.H - (this.registers.F.C ? 1 : 0));
                break;
            case 0x9D: // SBC A, L
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.registers.L - (this.registers.F.C ? 1 : 0));
                break;
            case 0x9E: // SBC A, (HL)
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.memory[this.getHL()] - (this.registers.F.C ? 1 : 0));
                break;
            case 0xDE: // SBC A, n
                this.registers.A = this.adjustFFPlusUpdateZC(this.registers.A - this.fetchByte() - (this.registers.F.C ? 1 : 0));
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
            case 0xB9: // CP C
                this.registers.F.Z = this.registers.A === this.registers.C;
                this.registers.F.C = this.registers.A < this.registers.C;
                break;
            case 0xBA: // CP D
                this.registers.F.Z = this.registers.A === this.registers.D;
                this.registers.F.C = this.registers.A < this.registers.D;
                break;
            case 0xBB: // CP E
                this.registers.F.Z = this.registers.A === this.registers.E;
                this.registers.F.C = this.registers.A < this.registers.E;
                break;
            case 0xBC: // CP H
                this.registers.F.Z = this.registers.A === this.registers.H;
                this.registers.F.C = this.registers.A < this.registers.H;
                break;
            case 0xBD: // CP L
                this.registers.F.Z = this.registers.A === this.registers.L;
                this.registers.F.C = this.registers.A < this.registers.L;
                break;
            case 0xBE: // CP (HL)
                {
                    const hlValue = memory[this.getHL()];
                    this.registers.F.Z = this.registers.A === hlValue;
                    this.registers.F.C = this.registers.A < hlValue;
                }
                break;
            case 0xBF: // CP A
                this.registers.F.Z = true;  // A == A is always true
                this.registers.F.C = false; // A < A is always false
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
            case 0xA8: // XOR B
                this.updateAZC(this.registers.A ^ this.registers.B);
                break;
            case 0xA9: // XOR C
                this.updateAZC(this.registers.A ^ this.registers.C);
                break;
            case 0xAA: // XOR D
                this.updateAZC(this.registers.A ^ this.registers.D);
                break;
            case 0xAB: // XOR E
                this.updateAZC(this.registers.A ^ this.registers.E);
                break;
            case 0xAC: // XOR H
                this.updateAZC(this.registers.A ^ this.registers.H);
                break;
            case 0xAD: // XOR L
                this.updateAZC(this.registers.A ^ this.registers.L);
                break;
            case 0xAE: // XOR (HL)
                this.updateAZC(this.registers.A ^ memory[this.getHL()]);
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
            case 0xE9: // JP (HL)
                this.registers.PC = this.getHL();
                break;
            
            // Conditional CALL instructions
            case 0xC4: // CALL NZ, nn
                {
                    const jump_address = this.fetchWord();
                    if (!this.registers.F.Z) {
                        const [lsb, msb] = this.wordToLSB_MSB(this.registers.PC);
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = msb;
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = lsb;
                        this.registers.PC = jump_address;
                    }
                }
                break;
            case 0xCC: // CALL Z, nn
                {
                    const jump_address = this.fetchWord();
                    if (this.registers.F.Z) {
                        const [lsb, msb] = this.wordToLSB_MSB(this.registers.PC);
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = msb;
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = lsb;
                        this.registers.PC = jump_address;
                    }
                }
                break;
            case 0xD4: // CALL NC, nn
                {
                    const jump_address = this.fetchWord();
                    if (!this.registers.F.C) {
                        const [lsb, msb] = this.wordToLSB_MSB(this.registers.PC);
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = msb;
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = lsb;
                        this.registers.PC = jump_address;
                    }
                }
                break;
            case 0xDC: // CALL C, nn
                {
                    const jump_address = this.fetchWord();
                    if (this.registers.F.C) {
                        const [lsb, msb] = this.wordToLSB_MSB(this.registers.PC);
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = msb;
                        this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                        memory[this.registers.SP] = lsb;
                        this.registers.PC = jump_address;
                    }
                }
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
            // RLC (Rotate Left Circular) instructions
            case 0x00: this.registers.B = this.rotateLeftCircular(this.registers.B); break;
            case 0x01: this.registers.C = this.rotateLeftCircular(this.registers.C); break;
            case 0x02: this.registers.D = this.rotateLeftCircular(this.registers.D); break;
            case 0x03: this.registers.E = this.rotateLeftCircular(this.registers.E); break;
            case 0x04: this.registers.H = this.rotateLeftCircular(this.registers.H); break;
            case 0x05: this.registers.L = this.rotateLeftCircular(this.registers.L); break;
            case 0x06: this.rotateLeftCircularAtHL(); break;
            case 0x07: this.registers.A = this.rotateLeftCircular(this.registers.A); break;
            
            // RRC (Rotate Right Circular) instructions
            case 0x08: this.registers.B = this.rotateRightCircular(this.registers.B); break;
            case 0x09: this.registers.C = this.rotateRightCircular(this.registers.C); break;
            case 0x0A: this.registers.D = this.rotateRightCircular(this.registers.D); break;
            case 0x0B: this.registers.E = this.rotateRightCircular(this.registers.E); break;
            case 0x0C: this.registers.H = this.rotateRightCircular(this.registers.H); break;
            case 0x0D: this.registers.L = this.rotateRightCircular(this.registers.L); break;
            case 0x0E: this.rotateRightCircularAtHL(); break;
            case 0x0F: this.registers.A = this.rotateRightCircular(this.registers.A); break;
            
            // RL (Rotate Left through carry) instructions
            case 0x10: this.registers.B = this.rotateLeftThroughCarry(this.registers.B); break;
            case 0x11: this.registers.C = this.rotateLeftThroughCarry(this.registers.C); break;
            case 0x12: this.registers.D = this.rotateLeftThroughCarry(this.registers.D); break;
            case 0x13: this.registers.E = this.rotateLeftThroughCarry(this.registers.E); break;
            case 0x14: this.registers.H = this.rotateLeftThroughCarry(this.registers.H); break;
            case 0x15: this.registers.L = this.rotateLeftThroughCarry(this.registers.L); break;
            case 0x16: this.rotateLeftThroughCarryAtHL(); break;
            case 0x17: this.registers.A = this.rotateLeftThroughCarry(this.registers.A); break;
            
            // RR (Rotate Right through carry) instructions
            case 0x18: this.registers.B = this.rotateRightThroughCarry(this.registers.B); break;
            case 0x19: this.registers.C = this.rotateRightThroughCarry(this.registers.C); break;
            case 0x1A: this.registers.D = this.rotateRightThroughCarry(this.registers.D); break;
            case 0x1B: this.registers.E = this.rotateRightThroughCarry(this.registers.E); break;
            case 0x1C: this.registers.H = this.rotateRightThroughCarry(this.registers.H); break;
            case 0x1D: this.registers.L = this.rotateRightThroughCarry(this.registers.L); break;
            case 0x1E: this.rotateRightThroughCarryAtHL(); break;
            case 0x1F: this.registers.A = this.rotateRightThroughCarry(this.registers.A); break;
            
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
            
            // RES (Reset bit) instructions
            case 0x80: this.registers.B = this.resetBit(0, this.registers.B); break;
            case 0x81: this.registers.C = this.resetBit(0, this.registers.C); break;
            case 0x82: this.registers.D = this.resetBit(0, this.registers.D); break;
            case 0x83: this.registers.E = this.resetBit(0, this.registers.E); break;
            case 0x84: this.registers.H = this.resetBit(0, this.registers.H); break;
            case 0x85: this.registers.L = this.resetBit(0, this.registers.L); break;
            case 0x86: this.resetBitAtHL(0); break;
            case 0x87: this.registers.A = this.resetBit(0, this.registers.A); break;
            case 0x88: this.registers.B = this.resetBit(1, this.registers.B); break;
            case 0x89: this.registers.C = this.resetBit(1, this.registers.C); break;
            case 0x8A: this.registers.D = this.resetBit(1, this.registers.D); break;
            case 0x8B: this.registers.E = this.resetBit(1, this.registers.E); break;
            case 0x8C: this.registers.H = this.resetBit(1, this.registers.H); break;
            case 0x8D: this.registers.L = this.resetBit(1, this.registers.L); break;
            case 0x8E: this.resetBitAtHL(1); break;
            case 0x8F: this.registers.A = this.resetBit(1, this.registers.A); break;
            case 0xB8: this.registers.B = this.resetBit(7, this.registers.B); break;
            case 0xB9: this.registers.C = this.resetBit(7, this.registers.C); break;
            case 0xBA: this.registers.D = this.resetBit(7, this.registers.D); break;
            case 0xBB: this.registers.E = this.resetBit(7, this.registers.E); break;
            case 0xBC: this.registers.H = this.resetBit(7, this.registers.H); break;
            case 0xBD: this.registers.L = this.resetBit(7, this.registers.L); break;
            case 0xBE: this.resetBitAtHL(7); break;
            case 0xBF: this.registers.A = this.resetBit(7, this.registers.A); break;
            
            // SET (Set bit) instructions
            case 0xC0: this.registers.B = this.setBit(0, this.registers.B); break;
            case 0xC1: this.registers.C = this.setBit(0, this.registers.C); break;
            case 0xC2: this.registers.D = this.setBit(0, this.registers.D); break;
            case 0xC3: this.registers.E = this.setBit(0, this.registers.E); break;
            case 0xC4: this.registers.H = this.setBit(0, this.registers.H); break;
            case 0xC5: this.registers.L = this.setBit(0, this.registers.L); break;
            case 0xC6: this.setBitAtHL(0); break;
            case 0xC7: this.registers.A = this.setBit(0, this.registers.A); break;
            case 0xC8: this.registers.B = this.setBit(1, this.registers.B); break;
            case 0xC9: this.registers.C = this.setBit(1, this.registers.C); break;
            case 0xCA: this.registers.D = this.setBit(1, this.registers.D); break;
            case 0xCB: this.registers.E = this.setBit(1, this.registers.E); break;
            case 0xCC: this.registers.H = this.setBit(1, this.registers.H); break;
            case 0xCD: this.registers.L = this.setBit(1, this.registers.L); break;
            case 0xCE: this.setBitAtHL(1); break;
            case 0xCF: this.registers.A = this.setBit(1, this.registers.A); break;
            case 0xF8: this.registers.B = this.setBit(7, this.registers.B); break;
            case 0xF9: this.registers.C = this.setBit(7, this.registers.C); break;
            case 0xFA: this.registers.D = this.setBit(7, this.registers.D); break;
            case 0xFB: this.registers.E = this.setBit(7, this.registers.E); break;
            case 0xFC: this.registers.H = this.setBit(7, this.registers.H); break;
            case 0xFD: this.registers.L = this.setBit(7, this.registers.L); break;
            case 0xFE: this.setBitAtHL(7); break;
            case 0xFF: this.registers.A = this.setBit(7, this.registers.A); break;
            
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
    
    // Rotate instructions helper methods
    rotateLeftCircular(value) {
        const bit7 = (value & 0x80) >> 7;
        this.registers.F.C = bit7 !== 0;
        const result = ((value << 1) | bit7) & 0xFF;
        this.registers.F.Z = result === 0;
        return result;
    }
    
    rotateLeftCircularAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        const bit7 = (value & 0x80) >> 7;
        this.registers.F.C = bit7 !== 0;
        this.memory[addr] = ((value << 1) | bit7) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    rotateRightCircular(value) {
        const bit0 = value & 0x01;
        this.registers.F.C = bit0 !== 0;
        const result = ((value >> 1) | (bit0 << 7)) & 0xFF;
        this.registers.F.Z = result === 0;
        return result;
    }
    
    rotateRightCircularAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        const bit0 = value & 0x01;
        this.registers.F.C = bit0 !== 0;
        this.memory[addr] = ((value >> 1) | (bit0 << 7)) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    rotateLeftThroughCarry(value) {
        const oldCarry = this.registers.F.C ? 1 : 0;
        this.registers.F.C = (value & 0x80) !== 0;
        const result = ((value << 1) | oldCarry) & 0xFF;
        this.registers.F.Z = result === 0;
        return result;
    }
    
    rotateLeftThroughCarryAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        const oldCarry = this.registers.F.C ? 1 : 0;
        this.registers.F.C = (value & 0x80) !== 0;
        this.memory[addr] = ((value << 1) | oldCarry) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    rotateRightThroughCarry(value) {
        const oldCarry = this.registers.F.C ? 0x80 : 0;
        this.registers.F.C = (value & 0x01) !== 0;
        const result = ((value >> 1) | oldCarry) & 0xFF;
        this.registers.F.Z = result === 0;
        return result;
    }
    
    rotateRightThroughCarryAtHL() {
        const addr = this.getHL();
        const value = this.memory[addr];
        const oldCarry = this.registers.F.C ? 0x80 : 0;
        this.registers.F.C = (value & 0x01) !== 0;
        this.memory[addr] = ((value >> 1) | oldCarry) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    // Bit manipulation helper methods
    setBit(bit, value) {
        return value | (1 << bit);
    }
    
    setBitAtHL(bit) {
        const addr = this.getHL();
        this.memory[addr] = this.memory[addr] | (1 << bit);
    }
    
    resetBit(bit, value) {
        return value & (~(1 << bit));
    }
    
    resetBitAtHL(bit) {
        const addr = this.getHL();
        this.memory[addr] = this.memory[addr] & (~(1 << bit));
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
