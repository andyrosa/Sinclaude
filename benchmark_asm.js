const BENCHMARK_ASM = `
; Increment and print HL every aproximately 4MM t-states
; which is about a second in a real Z80A

SCREEN_START:  equ 60000

    ld   hl, 0
performance_test:
    ld   de, SCREEN_START
    call hex_print_hl_at_de
    inc  hl
    call delay
    jp   performance_test

;----------------------------------------------
; increments DE by 4; clobbers af
hex_print_hl_at_de:
    ld   a, h
    call print_hex_a_at_de
    ld   a, l
    call print_hex_a_at_de
    ret

;----------------------------------------------
; increments DE by 2; clobbers af
print_hex_a_at_de:
    push af                 ; save original A
    rlca                    ; rotate left 4 times instead of right because this is the only rotation instruction we implemented :)
    rlca
    rlca
    rlca                    ; high nibble now in low nibble
    and  0Fh
    call print_hex_a_nibble_at_de
    pop  af                 ; restore original A
    and  0Fh
    jp print_hex_a_nibble_at_de

;----------------------------------------------
; increments DE; clobbers af
print_hex_a_nibble_at_de:
    add  a, '0'
    cp   ':'
    jr   c, print_hex_a_nibble_at_de_print
    add  a, 7               ; 'A'..'F'
print_hex_a_nibble_at_de_print:
    ld   (de), a
    inc  de
    ret
   
;=======================
delay:
    OUTER_COUNT: equ 4;
    INNER_COUNT: equ 41667;
    ;   12 (pushes) + 10 (ld de) + OUTER_COUNT * [10 + (INNER_COUNT * 24) + 24] + 12 (pops) + 10 (ret)
    ;   = 4,000,212 T-states
    push de                  ; 4 T-states
    push bc                  ; 4 T-states
    push af                  ; 4 T-states
    ld de, OUTER_COUNT       ; 10 T-states
outer_delay_loop:
    ld bc, INNER_COUNT       ; 10 T-states
inner_delay_loop:
    dec bc                   ; 6 T-states
    ld a, b                  ; 4 T-states
    or c                     ; 4 T-states
    jp nz, inner_delay_loop  ; 10 T-states --> Total: 24 T-states per inner loop
    dec de                   ; 6 T-states
    ld a, d                  ; 4 T-states
    or e                     ; 4 T-states
    jp nz, outer_delay_loop  ; 10 T-states --> Total: 24 T-states per outer loop
    pop af                   ; 4 T-states
    pop bc                   ; 4 T-states
    pop de                   ; 4 T-states
    ret                      ; 10 T-states
`;

// Export for use in the simulator
if (typeof window !== 'undefined') {
    window.BENCHMARK_ASM = BENCHMARK_ASM;
}

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BENCHMARK_ASM;
}
