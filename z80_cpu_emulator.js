// Z80 CPU Emulator
// Browser provides memory, all registers, and step count. Emulator executes instructions
//
// The instruction set is defined by the decoders in executeInstruction and executeCBInstruction;
// the assembler's definitions table (z80_assembler.js) lists what can be assembled.

// The 8-bit registers live in a Uint8Array laid out in the order the opcode register
// field names them, so a register operand is an array index: no switch, no lookup.
// Index 6 is unused: that field value means (HL). Stores are reduced modulo 256 by the
// typed array itself.
const REG_B = 0;
const REG_C = 1;
const REG_D = 2;
const REG_E = 3;
const REG_H = 4;
const REG_L = 5;
const REGISTER_FIELD_HL_INDIRECT = 6;
const REG_A = 7;
const REGISTER_FILE_SIZE = 8;

// CB-prefixed rotate/shift operation numbers (bits 3-5 of the second opcode byte)
const CB_SHIFT_SLL = 6; // Undocumented on the real chip and not implemented here

class Z80CPU {
    constructor() {
        this.regs = new Uint8Array(REGISTER_FILE_SIZE);
        // Use reset to initialize to avoid code duplication
        this.reset();
    }

    // Reset CPU to initial state
    // NOTE: only the Z (zero) and C (carry) flags are implemented.
    // The real Z80 also has S (sign), H (half-carry), P/V (parity/overflow),
    // and N (subtract) flags. Programs relying on those flags will not work correctly.
    reset() {
        this.regs.fill(0);
        this.PC = 0;
        this.SP = 0xFFFF;
        this.flagZ = false;
        this.flagC = false;
        this.shadowA = 0;
        this.shadowFlagZ = false;
        this.shadowFlagC = false;
        this.halted = false;
    }

    // Register snapshot for callers outside the emulator (display, tests)
    get registers() {
        return {
            A: this.regs[REG_A], B: this.regs[REG_B], C: this.regs[REG_C], D: this.regs[REG_D],
            E: this.regs[REG_E], H: this.regs[REG_H], L: this.regs[REG_L],
            PC: this.PC, SP: this.SP,
            F: { Z: this.flagZ, C: this.flagC }
        };
    }

    get shadowRegisters() {
        return {
            A: this.shadowA,
            F: { Z: this.shadowFlagZ, C: this.shadowFlagC }
        };
    }

    setFlags(zero, carry) {
        this.flagZ = zero;
        this.flagC = carry;
    }

    // Set CPU program counter and optionally stack pointer
    set(pc, sp = null) {
        this.PC = this.adjustFFFF(pc);
        if (sp !== null) {
            this.SP = this.adjustFFFF(sp);
        }
    }

    // Combine two bytes into a 16-bit word
    bytesToWord(lsb, msb) {
        return lsb | (msb << 8);
    }

    /**
     * Executes Z80 instructions for the specified number of steps
     * @param {Uint8Array} memory - System memory array (64KB for Z80)
     * @param {Uint8Array} iomap - I/O port map for IN/OUT instructions (256 ports)
     * @param {number} steps - Maximum number of instructions to execute
     * @returns {Object} Execution result
     * @returns {number} returns.instructionsExecuted - Actual instructions completed
     * @returns {boolean} returns.halted - Whether CPU halted (HLT instruction)
     * @returns {Object} returns.registers - Final CPU register state
     * @returns {string|null} returns.error - Error message if execution failed
     */
    executeSteps(memory, iomap, steps) {
        let instructionsExecuted = 0;
        let error = null;

        // Reset halted state when starting execution
        this.halted = false;

        // Store memory and iomap references for helper functions
        this.memory = memory;
        this.iomap = iomap;

        for (let i = 0; i < steps && !this.halted && !error; i++) {
            try {
                error = this.executeInstruction();
                if (error !== null) {
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
            registers: this.registers,
            shadowRegisters: this.shadowRegisters,
            error
        };
    }

    // Basic CPU primitive: fetch byte from memory at PC and increment PC
    fetchByte() {
        const byte = this.memory[this.PC];
        this.PC = this.adjustFFFF(this.PC + 1);
        return byte;
    }

    // Fetch 16-bit word (LSB first, then MSB) from memory at PC
    fetchWord() {
        const lsb = this.fetchByte();
        const msb = this.fetchByte();
        return this.bytesToWord(lsb, msb);
    }

    // Pop 16-bit word from stack and set PC
    popPC() {
        this.PC = this.popWord();
    }

    // Pop 16-bit word from stack (LSB at SP, MSB at SP+1)
    popWord() {
        const lsb = this.memory[this.SP];
        this.SP = this.adjustFFFF(this.SP + 1);
        const msb = this.memory[this.SP];
        this.SP = this.adjustFFFF(this.SP + 1);
        return this.bytesToWord(lsb, msb);
    }

    // Push 16-bit word to stack (MSB first so LSB ends up at the lower address)
    pushWord(word) {
        this.SP = this.adjustFFFF(this.SP - 1);
        this.memory[this.SP] = word >> 8;
        this.SP = this.adjustFFFF(this.SP - 1);
        this.memory[this.SP] = word;
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
        return this.bytesToWord(lsb, msb);
    }

    // Carry flag as an arithmetic operand (ADC, SBC, RL, RR)
    carryIn() {
        return this.flagC ? 1 : 0;
    }

    // CP: subtract without storing, flags only
    compareA(value) {
        this.flagZ = this.regs[REG_A] === value;
        this.flagC = this.regs[REG_A] < value;
    }

    adjustFFPlusUpdateZC(result) {
        const adjustedValue = this.adjustFF(result);
        this.flagZ = adjustedValue === 0;
        this.flagC = result > 255 || result < 0;
        return adjustedValue;
    }

    adjustFFFFUpdateC(result) {
        this.flagC = result > 0xFFFF;
        const adjustedValue = this.adjustFFFF(result);
        return adjustedValue;
    }

    adjustFFPlusUpdateZ(result) {
        const adjustedValue = this.adjustFF(result);
        this.flagZ = adjustedValue === 0;
        return adjustedValue;
    }

    updateAZC(value) {
        this.regs[REG_A] = value;
        this.flagZ = value === 0;
        this.flagC = false;
    }

    // Register pair access
    getHL() {
        return this.bytesToWord(this.regs[REG_L], this.regs[REG_H]);
    }

    getBC() {
        return this.bytesToWord(this.regs[REG_C], this.regs[REG_B]);
    }

    getDE() {
        return this.bytesToWord(this.regs[REG_E], this.regs[REG_D]);
    }

    setHL(value) {
        this.regs[REG_H] = value >> 8;
        this.regs[REG_L] = value;
    }

    setBC(value) {
        this.regs[REG_B] = value >> 8;
        this.regs[REG_C] = value;
    }

    setDE(value) {
        this.regs[REG_D] = value >> 8;
        this.regs[REG_E] = value;
    }

    // The 8-bit register field of an opcode: 0=B 1=C 2=D 3=E 4=H 5=L 6=(HL) 7=A
    readRegister8(field) {
        if (field === REGISTER_FIELD_HL_INDIRECT) {
            return this.memory[this.getHL()];
        }
        return this.regs[field];
    }

    writeRegister8(field, value) {
        if (field === REGISTER_FIELD_HL_INDIRECT) {
            this.memory[this.getHL()] = value;
        } else {
            this.regs[field] = value;
        }
    }

    // 8-bit ALU group, operation from bits 3-5 of the opcode:
    // 0=ADD 1=ADC 2=SUB 3=SBC 4=AND 5=XOR 6=OR 7=CP
    aluOperation(operation, value) {
        const accumulator = this.regs[REG_A];
        switch (operation) {
            case 0: this.regs[REG_A] = this.adjustFFPlusUpdateZC(accumulator + value); break;
            case 1: this.regs[REG_A] = this.adjustFFPlusUpdateZC(accumulator + value + this.carryIn()); break;
            case 2: this.regs[REG_A] = this.adjustFFPlusUpdateZC(accumulator - value); break;
            case 3: this.regs[REG_A] = this.adjustFFPlusUpdateZC(accumulator - value - this.carryIn()); break;
            case 4: this.updateAZC(accumulator & value); break;
            case 5: this.updateAZC(accumulator ^ value); break;
            case 6: this.updateAZC(accumulator | value); break;
            default: this.compareA(value); break;
        }
    }

    // Push current PC to stack and jump to target address
    callAddress(targetAddress) {
        this.pushWord(this.PC);
        this.PC = targetAddress;
    }

    // Convert signed byte (0-255) to signed offset (-128 to 127)
    toSignedByte(byte) {
        return (byte > 127) ? byte - 256 : byte;
    }

    // Conditional control flow. The operand is always fetched so PC advances
    // past the instruction whether or not the branch is taken.
    jumpRelativeIf(condition) {
        const displacement = this.toSignedByte(this.fetchByte());
        if (condition) this.PC = this.adjustFFFF(this.PC + displacement);
    }

    jumpIf(condition) {
        const address = this.fetchWord();
        if (condition) this.PC = address;
    }

    callIf(condition) {
        const address = this.fetchWord();
        if (condition) this.callAddress(address);
    }

    returnIf(condition) {
        if (condition) this.popPC();
    }

    // Executes one Z80 instruction; returns null on success or an error string
    executeInstruction() {
        const memory = this.memory;
        const regs = this.regs;
        const instructionAddress = this.PC;
        const opcode = this.fetchByte();

        // Groups with a regular encoding are decoded from the opcode's bit fields:
        // bits 0-2 and 3-5 name 8-bit registers (see readRegister8)
        const sourceField = opcode & 7;
        const destinationField = (opcode >> 3) & 7;

        if ((opcode & 0xC0) === 0x40 && opcode !== 0x76) { // LD r,r' (0x76 is HALT)
            this.writeRegister8(destinationField, this.readRegister8(sourceField));
            return null;
        }
        if ((opcode & 0xC0) === 0x80) { // ADD/ADC/SUB/SBC/AND/XOR/OR/CP A,r
            this.aluOperation(destinationField, this.readRegister8(sourceField));
            return null;
        }
        switch (opcode & 0xC7) {
            case 0x04: // INC r
                this.writeRegister8(destinationField, this.adjustFFPlusUpdateZ(this.readRegister8(destinationField) + 1));
                return null;
            case 0x05: // DEC r
                this.writeRegister8(destinationField, this.adjustFFPlusUpdateZ(this.readRegister8(destinationField) - 1));
                return null;
            case 0x06: // LD r,n
                this.writeRegister8(destinationField, this.fetchByte());
                return null;
            case 0xC6: // ADD/ADC/SUB/SBC/AND/XOR/OR/CP A,n
                this.aluOperation(destinationField, this.fetchByte());
                return null;
        }

        switch(opcode) {
            case 0x00: // NOP
                // No operation - just continue
                break;
            case 0x08: // EX AF, AF'
                // Exchange AF with shadow AF'
                const tempA = regs[REG_A];
                const tempZ = this.flagZ;
                const tempC = this.flagC;
                regs[REG_A] = this.shadowA;
                this.flagZ = this.shadowFlagZ;
                this.flagC = this.shadowFlagC;
                this.shadowA = tempA;
                this.shadowFlagZ = tempZ;
                this.shadowFlagC = tempC;
                break;
            case 0x07: // RLCA
                // Rotate Left Circular Accumulator
                const bit7 = (regs[REG_A] & 0x80) >> 7;
                regs[REG_A] = (regs[REG_A] << 1) | bit7;
                this.flagC = bit7 !== 0;
                break;
            case 0x0F: // RRCA
                // Rotate Right Circular Accumulator
                const bit0 = regs[REG_A] & 0x01;
                regs[REG_A] = (regs[REG_A] >> 1) | (bit0 << 7);
                this.flagC = bit0 !== 0;
                break;
            case 0x17: // RLA
                // Rotate Left Accumulator through carry
                const oldCarry = this.carryIn();
                const newCarry = (regs[REG_A] & 0x80) !== 0;
                regs[REG_A] = (regs[REG_A] << 1) | oldCarry;
                this.flagC = newCarry;
                break;
            case 0x1F: // RRA
                // Rotate Right Accumulator through carry
                const oldCarryRRA = this.carryIn() << 7;
                const newCarryRRA = (regs[REG_A] & 0x01) !== 0;
                regs[REG_A] = (regs[REG_A] >> 1) | oldCarryRRA;
                this.flagC = newCarryRRA;
                break;
            case 0x37: // SCF - Set Carry Flag
                this.flagC = true;
                break;
            case 0x3F: // CCF - Complement Carry Flag
                this.flagC = !this.flagC;
                break;
            case 0x2F: // CPL - Complement accumulator
                regs[REG_A] = ~regs[REG_A];
                break;
            case 0x76: // HALT
                // Halt execution
                this.halted = true;
                break;
            case 0x32: // LD (nn), A
                memory[this.fetchWord()] = regs[REG_A];
                break;
            case 0x3A: // LD A, (nn)
                regs[REG_A] = memory[this.fetchWord()];
                break;
            case 0xCD: // CALL nn
                this.callAddress(this.fetchWord());
                break;
            case 0xC9: // RET
                this.popPC();
                break;
            case 0xC0: // RET NZ
                this.returnIf(!this.flagZ);
                break;
            case 0xC8: // RET Z
                this.returnIf(this.flagZ);
                break;
            case 0xD0: // RET NC
                this.returnIf(!this.flagC);
                break;
            case 0xD8: // RET C
                this.returnIf(this.flagC);
                break;
            case 0x18: // JR n
                this.jumpRelativeIf(true);
                break;
            case 0x21: // LD HL, nn
                this.setHL(this.fetchWord());
                break;
            case 0x22: // LD (nn), HL
                {
                    const addr = this.fetchWord();
                    memory[addr] = regs[REG_L];
                    memory[this.adjustFFFF(addr + 1)] = regs[REG_H];
                }
                break;
            case 0x2A: // LD HL, (nn)
                {
                    const addr = this.fetchWord();
                    regs[REG_L] = memory[addr];
                    regs[REG_H] = memory[this.adjustFFFF(addr + 1)];
                }
                break;
            case 0x0A: // LD A, (BC)
                regs[REG_A] = memory[this.getBC()];
                break;
            case 0x1A: // LD A, (DE)
                regs[REG_A] = memory[this.getDE()];
                break;
            case 0xEB: // EX DE, HL
                const temp_D = regs[REG_D];
                const temp_E = regs[REG_E];
                regs[REG_D] = regs[REG_H];
                regs[REG_E] = regs[REG_L];
                regs[REG_H] = temp_D;
                regs[REG_L] = temp_E;
                break;
            case 0xE3: // EX (SP), HL
                {
                    const sp = this.SP;
                    const temp_L = regs[REG_L];
                    const temp_H = regs[REG_H];
                    regs[REG_L] = memory[sp];
                    regs[REG_H] = memory[this.adjustFFFF(sp + 1)];
                    memory[sp] = temp_L;
                    memory[this.adjustFFFF(sp + 1)] = temp_H;
                }
                break;
            case 0x31: // LD SP, nn
                this.SP = this.fetchWord();
                break;
            case 0x01: // LD BC, nn
                this.setBC(this.fetchWord());
                break;
            case 0x02: // LD (BC), A
                memory[this.getBC()] = regs[REG_A];
                break;
            case 0x11: // LD DE, nn
                this.setDE(this.fetchWord());
                break;
            case 0x12: // LD (DE), A
                memory[this.getDE()] = regs[REG_A];
                break;

            // 16-bit arithmetic
            case 0x23: // INC HL
                this.setHL(this.getHL() + 1);
                break;
            case 0x33: // INC SP
                this.SP = this.adjustFFFF(this.SP + 1);
                break;
            case 0x03: // INC BC
                this.setBC(this.getBC() + 1);
                break;
            case 0x13: // INC DE
                this.setDE(this.getDE() + 1);
                break;
            case 0x0B: // DEC BC
                this.setBC(this.getBC() - 1);
                break;
            case 0x1B: // DEC DE
                this.setDE(this.getDE() - 1);
                break;
            case 0x2B: // DEC HL
                this.setHL(this.getHL() - 1);
                break;
            case 0x3B: // DEC SP
                this.SP = this.adjustFFFF(this.SP - 1);
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
                this.setHL(this.adjustFFFFUpdateC(this.getHL() + this.SP));
                break;

            // I/O
            case 0xD3: // OUT (n), A
                const outPort = this.fetchByte();
                this.OutPort(outPort, regs[REG_A]);
                break;
            case 0xDB: // IN A, (n)
                const inPort = this.fetchByte();
                regs[REG_A] = this.InPort(inPort);
                break;

            // Conditional jumps
            case 0x28: // JR Z, n
                this.jumpRelativeIf(this.flagZ);
                break;
            case 0x20: // JR NZ, n
                this.jumpRelativeIf(!this.flagZ);
                break;
            case 0x38: // JR C, n
                this.jumpRelativeIf(this.flagC);
                break;
            case 0x30: // JR NC, n
                this.jumpRelativeIf(!this.flagC);
                break;
            case 0x10: // DJNZ n
                regs[REG_B] = regs[REG_B] - 1;
                this.jumpRelativeIf(regs[REG_B] !== 0);
                break;
            case 0xCA: // JP Z, nn
                this.jumpIf(this.flagZ);
                break;
            case 0xC2: // JP NZ, nn
                this.jumpIf(!this.flagZ);
                break;
            case 0xDA: // JP C, nn
                this.jumpIf(this.flagC);
                break;
            case 0xD2: // JP NC, nn
                this.jumpIf(!this.flagC);
                break;
            case 0xC3: // JP nn
                this.PC = this.fetchWord();
                break;
            case 0xE9: // JP (HL)
                this.PC = this.getHL();
                break;

            // Conditional CALL instructions
            case 0xC4: // CALL NZ, nn
                this.callIf(!this.flagZ);
                break;
            case 0xCC: // CALL Z, nn
                this.callIf(this.flagZ);
                break;
            case 0xD4: // CALL NC, nn
                this.callIf(!this.flagC);
                break;
            case 0xDC: // CALL C, nn
                this.callIf(this.flagC);
                break;

            // Stack operations
            case 0xC5: // PUSH BC
                this.pushWord(this.getBC());
                break;
            case 0xC1: // POP BC
                this.setBC(this.popWord());
                break;
            case 0xD5: // PUSH DE
                this.pushWord(this.getDE());
                break;
            case 0xE5: // PUSH HL
                this.pushWord(this.getHL());
                break;
            case 0xF5: // PUSH AF
                // Create proper F register encoding - Z80 flag register format
                // Bit 7: S (sign), Bit 6: Z (zero), Bit 5: unused, Bit 4: H (half-carry)
                // Bit 3: unused, Bit 2: P/V (parity/overflow), Bit 1: N (subtract), Bit 0: C (carry)
                const flagByte = (this.flagZ ? 0x40 : 0) | (this.flagC ? 0x01 : 0);
                this.pushWord(this.bytesToWord(flagByte, regs[REG_A]));
                break;
            case 0xD1: // POP DE
                this.setDE(this.popWord());
                break;
            case 0xE1: // POP HL
                this.setHL(this.popWord());
                break;
            case 0xF1: // POP AF
                const af = this.popWord();
                regs[REG_A] = af >> 8;
                this.flagZ = (af & 0x40) !== 0;
                this.flagC = (af & 0x01) !== 0;
                break;

            // Extended instructions (0xED prefix)
            case 0xED:
                const extOpcode = this.fetchByte();
                switch(extOpcode) {
                    case 0x44: // NEG
                        regs[REG_A] = this.adjustFFPlusUpdateZC(0 - regs[REG_A]);
                        break;
                    case 0xB0: // LDIR
                        let hl = this.getHL();
                        let de = this.getDE();
                        let bc = this.getBC();

                        // do-while: real Z80 decrements BC before testing, so BC=0 on entry means 65536 transfers
                        do {
                            // Copy byte from (HL) to (DE)
                            memory[de] = memory[hl];

                            // Increment HL and DE
                            hl = this.adjustFFFF(hl + 1);
                            de = this.adjustFFFF(de + 1);

                            // Decrement BC
                            bc = this.adjustFFFF(bc - 1);
                        } while (bc > 0);

                        // Update registers with final values
                        this.setHL(hl);
                        this.setDE(de);
                        this.setBC(bc);
                        break;
                    default:
                        return `Unknown extended opcode: 0xED 0x${formatHex2(extOpcode)} at address 0x${formatHex4(this.PC - 2)}`;
                }
                break;

            case 0xCB: // CB prefix - shift and bit instructions
                const cbOpcode = this.fetchByte();
                const cbError = this.executeCBInstruction(cbOpcode);
                if (cbError !== null) {
                    return cbError;
                }
                break;

            default:
                // Return error for unknown instructions
                return `Unknown opcode: 0x${formatHex2(opcode)} at address 0x${formatHex4(instructionAddress)}`;
        }
        return null; // Success - no error
    }

    // CB-prefixed instructions. The second byte is fully regular: bits 3-7 name the
    // operation (0-7 rotate/shift, 8-15 BIT b, 16-23 RES b, 24-31 SET b, with the bit
    // number in bits 3-5) and bits 0-2 the register (see readRegister8). One switch on
    // bits 3-7 keeps this a single jump table.
    executeCBInstruction(cbOpcode) {
        const registerField = cbOpcode & 7;
        const bit = (cbOpcode >> 3) & 7;
        const value = this.readRegister8(registerField);
        let result;

        switch (cbOpcode >> 3) {
            case 0: result = this.rotateLeftCircular(value); break;      // RLC
            case 1: result = this.rotateRightCircular(value); break;     // RRC
            case 2: result = this.rotateLeftThroughCarry(value); break;  // RL
            case 3: result = this.rotateRightThroughCarry(value); break; // RR
            case 4: result = this.shiftLeftArithmetic(value); break;     // SLA
            case 5: result = this.shiftRightArithmetic(value); break;    // SRA
            case CB_SHIFT_SLL:
                return `Unknown CB opcode: 0xCB 0x${formatHex2(cbOpcode)} at address 0x${formatHex4(this.PC - 2)}`;
            case 7: result = this.shiftRightLogical(value); break;       // SRL
            case 8: case 9: case 10: case 11: case 12: case 13: case 14: case 15:
                this.testBit(bit, value);
                return null;
            case 16: case 17: case 18: case 19: case 20: case 21: case 22: case 23:
                result = this.resetBit(bit, value);
                break;
            default:
                result = this.setBit(bit, value);
                break;
        }
        this.writeRegister8(registerField, result);
        return null;
    }

    // Helper methods for shift operations
    shiftLeftArithmetic(value) {
        this.flagC = (value & 0x80) !== 0;  // Save bit 7 to carry
        return this.adjustFFPlusUpdateZ(value << 1);
    }

    shiftRightArithmetic(value) {
        this.flagC = (value & 0x01) !== 0;  // Save bit 0 to carry
        return this.adjustFFPlusUpdateZ((value >> 1) | (value & 0x80));  // Preserve sign bit
    }

    shiftRightLogical(value) {
        this.flagC = (value & 0x01) !== 0;  // Save bit 0 to carry
        return this.adjustFFPlusUpdateZ(value >> 1);  // No sign preservation
    }

    testBit(bit, value) {
        const bitMask = 1 << bit;
        this.flagZ = (value & bitMask) === 0;
    }

    // Rotate instructions helper methods
    rotateLeftCircular(value) {
        const bit7 = (value & 0x80) >> 7;
        this.flagC = bit7 !== 0;
        return this.adjustFFPlusUpdateZ((value << 1) | bit7);
    }

    rotateRightCircular(value) {
        const bit0 = value & 0x01;
        this.flagC = bit0 !== 0;
        return this.adjustFFPlusUpdateZ((value >> 1) | (bit0 << 7));
    }

    rotateLeftThroughCarry(value) {
        const oldCarry = this.carryIn();
        this.flagC = (value & 0x80) !== 0;
        return this.adjustFFPlusUpdateZ((value << 1) | oldCarry);
    }

    rotateRightThroughCarry(value) {
        const oldCarry = this.carryIn() << 7;
        this.flagC = (value & 0x01) !== 0;
        return this.adjustFFPlusUpdateZ((value >> 1) | oldCarry);
    }

    // Bit manipulation helper methods
    setBit(bit, value) {
        return value | (1 << bit);
    }

    resetBit(bit, value) {
        return value & (~(1 << bit));
    }

    // I/O Port handling - use stored iomap (named to match Simulator.OutPort/InPort)
    OutPort(port, value) {
      this.iomap[port] = value;
    }

    InPort(port) {
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
