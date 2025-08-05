// Benchmark assembly code for performance testing
const BENCHMARK_ASM = `
;Count to 100 million

    call negate_screen
    performance_test:
        ld de, 10000

    speed_outer_loop:
        ld hl, 10000

    speed_inner_loop:
        dec hl      
        ld a, h
        or l        
        jr nz, speed_inner_loop 

        dec de            
        ld a, d
        or e              
        jr nz, speed_outer_loop
        call negate_screen
        halt

    negate_screen:
        ld hl, 60000       ; Start of screen memory
        ld bc, 768         ; Screen size (32x24 characters)

    xor_loop:
        ld a, (hl)         ; Load character from screen memory
        cpl                ; XOR with -1 (complement)
        ld (hl), a         ; Store back to screen memory
        inc hl             ; Increment source pointer
        dec bc             ; Decrement counter
        ld a, b
        or c
        jr nz, xor_loop    ; Repeat until BC is zero
        ret

`;

// Export for use in the simulator
if (typeof window !== 'undefined') {
    window.BENCHMARK_ASM = BENCHMARK_ASM;
}

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BENCHMARK_ASM;
}
