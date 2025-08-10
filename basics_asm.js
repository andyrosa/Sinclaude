const BASICS_ASM = `
; Basics test
    SCREEN_START  EQU 60000
    TWO           EQU 2
    FOUR          EQU TWO*TWO

    halt            ; so we can single-step from the start
    xor a           ; verify z=1, c=0
    inc a           ; verify z=0
    ccf             ; verify c=1
    ld hl, inc_all  ; address constant
    push hl         ; verify stack
    ld hl, TWO      ; constant use
    push hl         ; see hardware display of last two pushes
    pop de          ; second stack check
    ld de, TWO+1    ; constant math
    ld bc, FOUR     ; math in constant def
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
    window.BASICS_ASM = BASICS_ASM;
}

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BASICS_ASM;
}
