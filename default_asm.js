const DEFAULT_ASM = `
;Basic test

    SCREEN_START:  equ 60000

    halt ; so we can single-step from the start
    xor a
    inc a
    ccf
    ld hl, 2
    ld de, 3
    ld bc, 4
    push hl
inc_all:
    inc a
    ld (SCREEN_START), a
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
