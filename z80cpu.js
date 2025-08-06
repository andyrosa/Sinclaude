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
            PC: 0, SP: 0,
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
     * @param {number} steps - Maximum number of instructions to execute
     * @param {Object|null} initialRegisters - Optional register state to load before execution
     * @param {Object} initialRegisters.F - Flag register object with Z, C, N, H properties
     * @returns {Object} Execution result
     * @returns {number} returns.instructionsExecuted - Actual instructions completed
     * @returns {boolean} returns.halted - Whether CPU halted (HLT instruction)
     * @returns {Object} returns.registers - Final CPU register state
     * @returns {string|null} returns.error - Error message if execution failed
     */
    execute(memory, steps, initialRegisters = null) {
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
                const result = this.executeInstruction(memory);
                if (result && result.error) {
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

    // Helper function to increment PC and wrap at 16-bit boundary
    incrementPC(amount = 1) {
        this.registers.PC = this.adjustFFFF(this.registers.PC + amount);
    }

    // Helper functions to adjust register values with proper overflow/underflow handling
    adjustFF(value) {
        return value & 0xFF;
    }
    
    adjustFFFF(value) {
        return value & 0xFFFF;
    }


    updateArithmeticFlags(result, overflow) {
        const adjustedValue = this.adjustFF(result);
        this.registers.F.Z = adjustedValue === 0;
        this.registers.F.C = overflow;
        return adjustedValue;
    }

    updateIncrementFlags(register) {
        this.registers.F.Z = register === 0;
    }

    updateSubtractionFlags(result, underflow) {
        const adjustedValue = this.adjustFF(result);
        this.registers.F.Z = adjustedValue === 0;
        this.registers.F.C = underflow;
        return adjustedValue;
    }

    updateLogicalFlags(value) {
        this.registers.F.Z = value === 0;
        this.registers.F.C = false;
    }

    // Helper methods to consolidate common adjustFF patterns
    incrementRegister(registerName) {
        this.registers[registerName] = this.adjustFF(this.registers[registerName] + 1);
        this.updateIncrementFlags(this.registers[registerName]);
    }

    decrementRegister(registerName) {
        this.registers[registerName] = this.adjustFF(this.registers[registerName] - 1);
        this.updateIncrementFlags(this.registers[registerName]);
    }

    incrementMemory(address) {
        const newValue = this.adjustFF(this.memory[address] + 1);
        this.memory[address] = newValue;
        this.updateIncrementFlags(newValue);
    }

    decrementMemory(address) {
        const newValue = this.adjustFF(this.memory[address] - 1);
        this.memory[address] = newValue;
        this.updateIncrementFlags(newValue);
    }

    splitWordToRegisters(value, highReg, lowReg) {
        this.registers[highReg] = this.adjustFF(value >> 8);
        this.registers[lowReg] = this.adjustFF(value);
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

    // Execute one Z80 instruction
    executeInstruction(memory) {
        // Store memory reference for helper functions
        this.memory = memory;
        const opcode = memory[this.registers.PC];
        this.incrementPC();
        
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
                this.registers.A = (~this.registers.A) & 0xFF;
                break;
            case 0x76: // HALT
                // Halt execution
                this.halted = true;
                break;
            case 0x3E: // LD A, n
                this.registers.A = memory[this.registers.PC++];
                break;
            case 0x32: // LD (nn), A
                const addr = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                memory[addr] = this.registers.A;
                this.incrementPC(2);
                break;
            case 0x3A: // LD A, (nn)
                const addr2 = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.registers.A = memory[addr2];
                this.incrementPC(2);
                break;
            case 0xCD: // CALL nn
                {
                    const address = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                    this.incrementPC(2);
                    // Push return address to stack
                    this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                    memory[this.registers.SP] = (this.registers.PC >> 8) & 0xFF;
                    this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                    memory[this.registers.SP] = this.registers.PC & 0xFF;
                    this.registers.PC = address;
                }
                break;
            case 0xC9: // RET
                this.registers.PC = memory[this.registers.SP] | (memory[this.registers.SP + 1] << 8);
                this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
                break;
            case 0xC0: // RET NZ
                if (!this.registers.F.Z) {
                    this.registers.PC = memory[this.registers.SP] | (memory[this.registers.SP + 1] << 8);
                    this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
                }
                break;
            case 0xC8: // RET Z
                if (this.registers.F.Z) {
                    this.registers.PC = memory[this.registers.SP] | (memory[this.registers.SP + 1] << 8);
                    this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
                }
                break;
            case 0xD0: // RET NC
                if (!this.registers.F.C) {
                    this.registers.PC = memory[this.registers.SP] | (memory[this.registers.SP + 1] << 8);
                    this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
                }
                break;
            case 0xD8: // RET C
                if (this.registers.F.C) {
                    this.registers.PC = memory[this.registers.SP] | (memory[this.registers.SP + 1] << 8);
                    this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
                }
                break;
            case 0x18: // JR n
                const offset = memory[this.registers.PC];
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
                const signedOffset = (offset > 127) ? offset - 256 : offset;
                this.registers.PC = (this.registers.PC + signedOffset) & 0xFFFF;
                break;
            case 0x21: // LD HL, nn
                this.registers.L = memory[this.registers.PC++];
                this.registers.H = memory[this.registers.PC++];
                break;
            case 0x36: // LD (HL), n
                memory[this.getHL()] = memory[this.registers.PC];
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
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
                this.registers.B = memory[this.registers.PC++];
                break;
            case 0x0E: // LD C, n
                this.registers.C = memory[this.registers.PC++];
                break;
            case 0x16: // LD D, n
                this.registers.D = memory[this.registers.PC++];
                break;
            case 0x1E: // LD E, n
                this.registers.E = memory[this.registers.PC++];
                break;
            case 0x26: // LD H, n
                this.registers.H = memory[this.registers.PC++];
                break;
            case 0x2E: // LD L, n
                this.registers.L = memory[this.registers.PC++];
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
                this.registers.SP = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.incrementPC(2);
                break;
            case 0x01: // LD BC, nn
                this.registers.C = memory[this.registers.PC++];
                this.registers.B = memory[this.registers.PC++];
                break;
            case 0x02: // LD (BC), A
                memory[this.getBC()] = this.registers.A;
                break;
            case 0x11: // LD DE, nn
                this.registers.E = memory[this.registers.PC++];
                this.registers.D = memory[this.registers.PC++];
                break;
            case 0x12: // LD (DE), A
                memory[this.getDE()] = this.registers.A;
                break;
                
            // Arithmetic
            case 0x04: // INC B
                this.incrementRegister('B');
                break;
            case 0x0C: // INC C
                this.incrementRegister('C');
                break;
            case 0x14: // INC D
                this.incrementRegister('D');
                break;
            case 0x1C: // INC E
                this.incrementRegister('E');
                break;
            case 0x24: // INC H
                this.incrementRegister('H');
                break;
            case 0x2C: // INC L
                this.incrementRegister('L');
                break;
            case 0x3C: // INC A
                this.incrementRegister('A');
                break;
            case 0x34: // INC (HL)
                this.incrementMemory(this.getHL());
                break;
            case 0x3D: // DEC A
                this.decrementRegister('A');
                break;
            case 0x05: // DEC B
                this.decrementRegister('B');
                break;
            case 0x0D: // DEC C
                this.decrementRegister('C');
                break;
            case 0x15: // DEC D
                this.decrementRegister('D');
                break;
            case 0x1D: // DEC E
                this.decrementRegister('E');
                break;
            case 0x25: // DEC H
                this.decrementRegister('H');
                break;
            case 0x2D: // DEC L
                this.decrementRegister('L');
                break;
            case 0x23: // INC HL
                let hl = this.getHL();
                hl = this.adjustFFFF(hl + 1);
                this.setHL(hl);
                break;
            case 0x33: // INC SP
                this.registers.SP = this.adjustFFFF(this.registers.SP + 1);
                break;
            case 0x03: // INC BC
                let bc_inc = this.getBC();
                bc_inc = this.adjustFFFF(bc_inc + 1);
                this.setBC(bc_inc);
                break;
            case 0x13: // INC DE
                let de_inc = this.getDE();
                de_inc = this.adjustFFFF(de_inc + 1);
                this.setDE(de_inc);
                break;
            case 0x0B: // DEC BC
                let bc = this.getBC();
                bc = this.adjustFFFF(bc - 1);
                this.setBC(bc);
                break;
            case 0x1B: // DEC DE
                let de = this.getDE();
                de = this.adjustFFFF(de - 1);
                this.setDE(de);
                break;
            case 0x2B: // DEC HL
                let hl_dec = this.getHL();
                hl_dec = this.adjustFFFF(hl_dec - 1);
                this.setHL(hl_dec);
                break;
            case 0x3B: // DEC SP
                this.registers.SP = this.adjustFFFF(this.registers.SP - 1);
                break;
            case 0x35: // DEC (HL)
                this.decrementMemory(this.getHL());
                break;
            case 0x09: // ADD HL, BC
                let hlVal = this.getHL();
                let bcVal = this.getBC();
                const add16Result = hlVal + bcVal;
                this.registers.F.C = add16Result > 0xFFFF;
                hlVal = this.adjustFFFF(add16Result);
                this.setHL(hlVal);
                break;
            case 0x19: // ADD HL, DE
                {
                    let hl = this.getHL();
                    const de = this.getDE();
                    const add16Result = hl + de;
                    this.registers.F.C = add16Result > 0xFFFF;
                    hl = this.adjustFFFF(add16Result);
                    this.setHL(hl);
                }
                break;
            case 0x29: // ADD HL, HL
                {
                    let hl = (this.registers.H << 8) | this.registers.L;
                    const add16Result = hl + hl;
                    this.registers.F.C = add16Result > 0xFFFF;
                    hl = this.adjustFFFF(add16Result);
                    this.registers.H = (hl >> 8) & 0xFF;
                    this.registers.L = hl & 0xFF;
                }
                break;
            case 0x39: // ADD HL, SP
                {
                    let hl = (this.registers.H << 8) | this.registers.L;
                    const add16Result = hl + this.registers.SP;
                    this.registers.F.C = add16Result > 0xFFFF;
                    hl = this.adjustFFFF(add16Result);
                    this.registers.H = (hl >> 8) & 0xFF;
                    this.registers.L = hl & 0xFF;
                }
                break;
            case 0x80: // ADD A, B
                const addResult = this.registers.A + this.registers.B;
                this.registers.A = this.updateArithmeticFlags(addResult, addResult > 255);
                break;
            case 0x81: // ADD A, C
                const addCResult = this.registers.A + this.registers.C;
                this.registers.A = this.updateArithmeticFlags(addCResult, addCResult > 255);
                break;
            case 0x82: // ADD A, D
                const addDResult = this.registers.A + this.registers.D;
                this.registers.A = this.updateArithmeticFlags(addDResult, addDResult > 255);
                break;
            case 0x83: // ADD A, E
                const addEResult = this.registers.A + this.registers.E;
                this.registers.A = this.updateArithmeticFlags(addEResult, addEResult > 255);
                break;
            case 0x84: // ADD A, H
                const addHResult = this.registers.A + this.registers.H;
                this.registers.A = this.updateArithmeticFlags(addHResult, addHResult > 255);
                break;
            case 0x87: // ADD A, A
                const addAResult = this.registers.A + this.registers.A;
                this.registers.A = this.updateArithmeticFlags(addAResult, addAResult > 255);
                break;
            case 0x85: // ADD A, L
                const addLResult = this.registers.A + this.registers.L;
                this.registers.A = this.updateArithmeticFlags(addLResult, addLResult > 255);
                break;
            case 0xC6: // ADD A, n
                const addNResult = this.registers.A + memory[this.registers.PC];
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
                this.registers.A = this.updateArithmeticFlags(addNResult, addNResult > 255);
                break;
            case 0x8C: // ADC A, H
                const adcHResult = this.registers.A + this.registers.H + (this.registers.F.C ? 1 : 0);
                this.registers.A = this.updateArithmeticFlags(adcHResult, adcHResult > 255);
                break;
            case 0xCE: // ADC A, n
                const adcResult = this.registers.A + memory[this.registers.PC] + (this.registers.F.C ? 1 : 0);
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
                this.registers.A = this.updateArithmeticFlags(adcResult, adcResult > 255);
                break;
            case 0x97: // SUB A
                this.registers.A = 0;
                this.registers.F.Z = true;
                this.registers.F.C = false;
                break;
            case 0x90: // SUB B
                const result = this.registers.A - this.registers.B;
                this.registers.A = this.updateSubtractionFlags(result, result < 0);
                break;
            case 0x91: // SUB C
                const subCResult = this.registers.A - this.registers.C;
                this.registers.A = this.updateSubtractionFlags(subCResult, subCResult < 0);
                break;
            case 0x92: // SUB D
                const subDResult = this.registers.A - this.registers.D;
                this.registers.A = this.updateSubtractionFlags(subDResult, subDResult < 0);
                break;
            case 0x93: // SUB E
                const subEResult = this.registers.A - this.registers.E;
                this.registers.A = this.updateSubtractionFlags(subEResult, subEResult < 0);
                break;
            case 0x94: // SUB H
                const subHResult = this.registers.A - this.registers.H;
                this.registers.A = this.updateSubtractionFlags(subHResult, subHResult < 0);
                break;
            case 0x95: // SUB L
                const subLResult = this.registers.A - this.registers.L;
                this.registers.A = this.updateSubtractionFlags(subLResult, subLResult < 0);
                break;
            case 0xD6: // SUB A, n
                const subResult = this.registers.A - memory[this.registers.PC];
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
                this.registers.A = this.updateSubtractionFlags(subResult, subResult < 0);
                break;
                
            // AND instructions
            case 0xA0: // AND B
                this.registers.A &= this.registers.B;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA1: // AND C
                this.registers.A &= this.registers.C;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA2: // AND D
                this.registers.A &= this.registers.D;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA3: // AND E
                this.registers.A &= this.registers.E;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA4: // AND H
                this.registers.A &= this.registers.H;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA5: // AND L
                this.registers.A &= this.registers.L;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA6: // AND (HL)
                this.registers.A &= memory[this.getHL()];
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xA7: // AND A
                this.registers.A &= this.registers.A;
                this.updateLogicalFlags(this.registers.A);
                break;
                
            // Comparison and logic
            case 0xFE: // CP n
                const cpVal = memory[this.registers.PC];
                this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
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
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB0: // OR B
                this.registers.A |= this.registers.B;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB1: // OR C
                this.registers.A |= this.registers.C;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB2: // OR D
                this.registers.A |= this.registers.D;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB3: // OR E
                this.registers.A |= this.registers.E;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB4: // OR H
                this.registers.A |= this.registers.H;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB5: // OR L
                this.registers.A |= this.registers.L;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xB6: // OR (HL)
                this.registers.A |= memory[this.getHL()];
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xF6: // OR n
                this.registers.A |= memory[this.registers.PC++];
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xAF: // XOR A
                this.registers.A = 0;
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xEE: // XOR n
                this.registers.A ^= memory[this.registers.PC++];
                this.updateLogicalFlags(this.registers.A);
                break;
            case 0xE6: // AND n
                this.registers.A &= memory[this.registers.PC++];
                this.updateLogicalFlags(this.registers.A);
                break;
                
            // Conditional jumps
            case 0x28: // JR Z, n
                const jrZOffset = memory[this.registers.PC++];
                if (this.registers.F.Z) {
                    this.registers.PC += (jrZOffset > 127) ? jrZOffset - 256 : jrZOffset;
                }
                break;
            case 0x20: // JR NZ, n
                const jrNzOffset = memory[this.registers.PC++];
                if (!this.registers.F.Z) {
                    this.registers.PC += (jrNzOffset > 127) ? jrNzOffset - 256 : jrNzOffset;
                }
                break;
            case 0x38: // JR C, n
                const jrCOffset = memory[this.registers.PC++];
                if (this.registers.F.C) {
                    this.registers.PC += (jrCOffset > 127) ? jrCOffset - 256 : jrCOffset;
                }
                break;
            case 0x30: // JR NC, n
                const jrNCOffset = memory[this.registers.PC++];
                if (!this.registers.F.C) {
                    this.registers.PC += (jrNCOffset > 127) ? jrNCOffset - 256 : jrNCOffset;
                }
                break;
            case 0x10: // DJNZ n
                this.registers.B = (this.registers.B - 1) & 0xFF;
                const djnzOffset = memory[this.registers.PC++];
                if (this.registers.B !== 0) {
                    this.registers.PC += (djnzOffset > 127) ? djnzOffset - 256 : djnzOffset;
                }
                break;
            case 0xCA: // JP Z, nn
                const jpZAddr = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.incrementPC(2);
                if (this.registers.F.Z) {
                    this.registers.PC = jpZAddr;
                }
                break;
            case 0xC2: // JP NZ, nn
                const jpNzAddr = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.incrementPC(2);
                if (!this.registers.F.Z) {
                    this.registers.PC = jpNzAddr;
                }
                break;
            case 0xDA: // JP C, nn
                const jpCAddr = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.incrementPC(2);
                if (this.registers.F.C) {
                    this.registers.PC = jpCAddr;
                }
                break;
            case 0xD2: // JP NC, nn
                const jpNCAddr = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                this.incrementPC(2);
                if (!this.registers.F.C) {
                    this.registers.PC = jpNCAddr;
                }
                break;
            case 0xC3: // JP nn
                {
                    const address = memory[this.registers.PC] | (memory[this.registers.PC + 1] << 8);
                    this.registers.PC = address;
                }
                break;
                
            // Stack operations
            case 0xC5: // PUSH BC
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.B;
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.C;
                break;
            case 0xC1: // POP BC
                this.registers.C = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                this.registers.B = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                break;
            case 0xD5: // PUSH DE
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.D;
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.E;
                break;
            case 0xE5: // PUSH HL
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.H;
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.L;
                break;
            case 0xF5: // PUSH AF
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = this.registers.A;
                this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
                memory[this.registers.SP] = (this.registers.F.Z ? 0x40 : 0) | (this.registers.F.C ? 0x01 : 0);
                break;
            case 0xD1: // POP DE
                this.registers.E = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                this.registers.D = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                break;
            case 0xE1: // POP HL
                this.registers.L = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                this.registers.H = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                break;
            case 0xF1: // POP AF
                const flags = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                this.registers.A = memory[this.registers.SP];
                this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
                this.registers.F.Z = (flags & 0x40) !== 0;
                this.registers.F.C = (flags & 0x01) !== 0;
                break;
                
            // Extended instructions (0xED prefix)
            case 0xED:
                const extOpcode = memory[this.registers.PC++];
                switch(extOpcode) {
                    case 0x44: // NEG
                        this.registers.A = this.adjustFF(-this.registers.A);
                        break;
                    case 0xB0: // LDIR
                        let hl = (this.registers.H << 8) | this.registers.L;
                        let de = (this.registers.D << 8) | this.registers.E;
                        let bc = (this.registers.B << 8) | this.registers.C;
                        
                        while (bc > 0) {
                            // Copy byte from (HL) to (DE)
                            memory[de] = memory[hl];
                            
                            // Increment HL and DE
                            hl = this.adjustFFFF(hl + 1);
                            de = this.adjustFFFF(de + 1);
                            
                            // Decrement BC
                            bc--;
                        }
                        
                        // Update registers with final values
                        this.splitWordToRegisters(hl, 'H', 'L');
                        this.splitWordToRegisters(de, 'D', 'E');
                        this.registers.B = 0;
                        this.registers.C = 0;
                        break;
                    default:
                        const extErrorMsg = `Unknown extended opcode: 0xED 0x${extOpcode.toString(16).toUpperCase()}`;
                        console.error(extErrorMsg);
                        return { error: extErrorMsg };
                }
                break;
                
            case 0xCB: // CB prefix - shift and bit instructions
                {
                    const cbOpcode = memory[this.registers.PC++];
                    this.executeCBInstruction(cbOpcode);
                }
                break;
                
            default:
                // Return error for unknown instructions
                const errorMsg = `Unknown opcode: 0x${opcode.toString(16).toUpperCase()} at PC=${(this.registers.PC-1).toString(16).toUpperCase()}`;
                return { error: errorMsg };
                break;
        }
        this.registers.PC &= 0xFFFF;
    }
    
    // Execute CB-prefixed instructions (shift and bit operations)
    executeCBInstruction(cbOpcode) {
        switch(cbOpcode) {
            // SLA (Shift Left Arithmetic) instructions
            case 0x20: this.shiftLeftArithmetic('B'); break;
            case 0x21: this.shiftLeftArithmetic('C'); break;
            case 0x22: this.shiftLeftArithmetic('D'); break;
            case 0x23: this.shiftLeftArithmetic('E'); break;
            case 0x24: this.shiftLeftArithmetic('H'); break;
            case 0x25: this.shiftLeftArithmetic('L'); break;
            case 0x26: this.shiftLeftArithmeticHL(); break;
            case 0x27: this.shiftLeftArithmetic('A'); break;
            
            // SRA (Shift Right Arithmetic) instructions
            case 0x28: this.shiftRightArithmetic('B'); break;
            case 0x29: this.shiftRightArithmetic('C'); break;
            case 0x2A: this.shiftRightArithmetic('D'); break;
            case 0x2B: this.shiftRightArithmetic('E'); break;
            case 0x2C: this.shiftRightArithmetic('H'); break;
            case 0x2D: this.shiftRightArithmetic('L'); break;
            case 0x2E: this.shiftRightArithmeticHL(); break;
            case 0x2F: this.shiftRightArithmetic('A'); break;
            
            // SRL (Shift Right Logical) instructions
            case 0x38: this.shiftRightLogical('B'); break;
            case 0x39: this.shiftRightLogical('C'); break;
            case 0x3A: this.shiftRightLogical('D'); break;
            case 0x3B: this.shiftRightLogical('E'); break;
            case 0x3C: this.shiftRightLogical('H'); break;
            case 0x3D: this.shiftRightLogical('L'); break;
            case 0x3E: this.shiftRightLogicalHL(); break;
            case 0x3F: this.shiftRightLogical('A'); break;
            
            // BIT test instructions (test bit 7)
            case 0x47: this.testBit(0, 'A'); break;
            case 0x4F: this.testBit(1, 'A'); break;
            case 0x57: this.testBit(2, 'A'); break;
            case 0x5F: this.testBit(3, 'A'); break;
            case 0x67: this.testBit(4, 'A'); break;
            case 0x6F: this.testBit(5, 'A'); break;
            case 0x77: this.testBit(6, 'A'); break;
            case 0x7F: this.testBit(7, 'A'); break;
            case 0x7B: this.testBit(7, 'E'); break;
            case 0x7A: this.testBit(7, 'D'); break;
            
            default:
                return { error: `Unknown CB opcode: 0x${cbOpcode.toString(16).toUpperCase()}` };
        }
    }
    
    // Execute ED-prefixed instructions (extended instructions)
    executeEDInstruction(edOpcode) {
        switch(edOpcode) {
            case 0x44: // NEG
                this.registers.A = (-this.registers.A) & 0xFF;
                this.registers.F.Z = this.registers.A === 0;
                this.registers.F.C = this.registers.A !== 0;
                break;
                
            default:
                return { error: `Unknown ED opcode: 0x${edOpcode.toString(16).toUpperCase()}` };
        }
    }
    
    // Helper methods for shift operations
    shiftLeftArithmetic(reg) {
        const value = this.registers[reg];
        this.registers.F.C = (value & 0x80) !== 0;  // Save bit 7 to carry
        this.registers[reg] = (value << 1) & 0xFF;
        this.registers.F.Z = this.registers[reg] === 0;
    }
    
    shiftLeftArithmeticHL() {
        const addr = (this.registers.H << 8) | this.registers.L;
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x80) !== 0;
        this.memory[addr] = (value << 1) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    shiftRightArithmetic(reg) {
        const value = this.registers[reg];
        this.registers.F.C = (value & 0x01) !== 0;  // Save bit 0 to carry
        this.registers[reg] = ((value >> 1) | (value & 0x80)) & 0xFF;  // Preserve sign bit
        this.registers.F.Z = this.registers[reg] === 0;
    }
    
    shiftRightArithmeticHL() {
        const addr = (this.registers.H << 8) | this.registers.L;
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x01) !== 0;
        this.memory[addr] = ((value >> 1) | (value & 0x80)) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    shiftRightLogical(reg) {
        const value = this.registers[reg];
        this.registers.F.C = (value & 0x01) !== 0;  // Save bit 0 to carry
        this.registers[reg] = (value >> 1) & 0xFF;  // No sign preservation
        this.registers.F.Z = this.registers[reg] === 0;
    }
    
    shiftRightLogicalHL() {
        const addr = (this.registers.H << 8) | this.registers.L;
        const value = this.memory[addr];
        this.registers.F.C = (value & 0x01) !== 0;
        this.memory[addr] = (value >> 1) & 0xFF;
        this.registers.F.Z = this.memory[addr] === 0;
    }
    
    testBit(bit, reg) {
        const value = this.registers[reg];
        const bitMask = 1 << bit;
        this.registers.F.Z = (value & bitMask) === 0;
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Z80CPU;
}
