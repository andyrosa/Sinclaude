const DEFAULT_ASM = `
    ;Assembler basic test

    SCREEN_START:  equ 60000

    halt ; so we can single-step from the start
    xor a ; verify z flag and not c
    inc a ; verify not z
    ccf ; verify c flag
    ld hl, 2
    ld de, 3
    ld bc, 4
    push hl ; verify sp
inc_all:
    ld (SCREEN_START), a
    inc a
    inc hl
    inc de
    inc bc
    jp inc_all

`;

// Export for use in the simulator
if (typeof window !== 'undefined') {
    window.DEFAULT_ASM = DEFAULT_ASM;
}

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DEFAULT_ASM;
}
