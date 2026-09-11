const CHESS_ASM = `; 1.3K Chess: 1236 bytes of code and data.
; Inspired by "Full ZX-81 Chess in 1K", Your Computer, February 1983.
; A 0x88 board makes every edge test a single AND. Bit 3 is Black;
; bit 4 records movement, so castling needs no separate rights table.
BOARD EQU 0x2000
SIDE EQU BOARD + 128
EP EQU SIDE + 1
FROM EQU EP + 1
TO EQU FROM + 1
PROMOTION EQU TO + 1
BEST_SCORE EQU PROMOTION + 1
BEST_FROM EQU BEST_SCORE + 1
BEST_TO EQU BEST_FROM + 1
BEST_PROMOTION EQU BEST_TO + 1
TARGET EQU BEST_PROMOTION + 1
BACKUP EQU 0x2100
MOVES EQU 0x2200

ORG 0
CHESS_START:
    ld hl, 60000
    ld de, 60001
    ld bc, 767
    ld (hl), ' '
    ldir
    ld hl, BOARD
    ld de, BOARD + 1
    ld c, 129
    ld (hl), l
    ldir
    ld de, BACK_RANK
    ld b, 8
INIT_PIECE:
    ld h, 32
    ld l, c
    ld a, (de)
    ld (hl), a
    push af
    ld a, c
    or 112
    ld l, a
    pop af
    or 8
    ld (hl), a
    ld a, l
    sub 16
    ld l, a
    ld (hl), 9
    ld a, c
    add a, 16
    ld l, a
    ld (hl), 1
    inc de
    inc c
    djnz INIT_PIECE
    ld hl, FILE_LABELS
    ld de, 60001
    ld bc, 8
    ldir
    ld de, 60288
    ld c, 10
    ldir
    ld de, 60352
    ld c, 8
    ldir
MAIN:
    call DRAW
    call SEARCH
    ld a, (BEST_SCORE)
    or a
    jr z, GAME_OVER
    ld a, (SIDE)
    or a
    jr nz, INPUT_RESET
    call BEST_MOVE
    jr MAIN
INPUT_RESET:
    xor a
    ld (60324), a
DRIVER:
    ld hl, 60320
    ld de, 60321
    ld bc, 3
    ld (hl), '-'
    ldir
    ld de, 60320
    call READ_SQUARE
    ld (FROM), a
    call READ_SQUARE
    ld (TO), a
    call GENERATE
    ld b, e
    ld a, b
    or a
    jr z, BAD_INPUT
    ld hl, MOVES
    ld a, (TO)
FIND_MOVE:
    cp (hl)
    jr z, HUMAN_TRY
    inc hl
    djnz FIND_MOVE
BAD_INPUT:
    ld a, '?'
    ld (60324), a
    jr DRIVER
HUMAN_TRY:
    ld a, 5
    ld (PROMOTION), a
    call TRY_MOVE
    ; LDIR preserves carry, so restoring the trial preserves the legality result.
    call RESTORE_TRIAL
    jr c, BAD_INPUT
    call IS_PROMOTION
    jr nz, HUMAN_COMMIT
    ld a, 'P'
    ld (60324), a
    ld bc, 4*256+'1'
    call KEY
    ld (60324), a
    cpl
    add a, '1'+6
    ld (PROMOTION), a
HUMAN_COMMIT:
    call MAKE
    jr MAIN
GAME_OVER:
    call CHECK
    ld hl, DRAW_TEXT
    jr nc, SHOW_RESULT
    ld hl, MATE_TEXT
SHOW_RESULT:
    ld de, 60320
    ld bc, 4
    ldir
NO_MOVE:
    jr NO_MOVE

READ_SQUARE:
    ld bc, 8*256+'A'
    call KEY
    ld (de), a
    inc de
    sub 'A'
    push af
    ld bc, 8*256+'1'
    call KEY
    ld (de), a
    inc de
    sub '1'
    rlca
    rlca
    rlca
    rlca
    pop hl
    add a, h
    ret
KEY:
    ; Port 5 consumes a decoded ZX81 keypress; 255 means the queue is empty.
    ; Original ZX81: SLOW mode updates two-byte LAST_K ($4025). For a valid
    ; key, load LAST_K into BC, call ROM $07BD, then read the character at (HL).
    in a, (5)
    sub c
    cp b
    jr nc, KEY
    add a, c
    ret

DRAW:
    ld de, 60032
    ld c, 0
DRAW_ROW:
    ld a, c
    rrca
    rrca
    rrca
    rrca
    add a, '1'
    ld (de), a
    inc de
    ld a, c
    add a, 7
    ld c, a
    ld b, 8
DRAW_SQUARE:
    ld h, 32
    ld l, c
    ld a, (hl)
    push bc
    ld b, a
    and 7
    ld hl, GLYPHS
    add a, l
    ld l, a
    ld a, b
    rrca
    rrca
    rrca
    rrca
    and 128
    ld b, a
    ld a, (hl)
    or b
    ld (de), a
    pop bc
    inc de
    dec c
    djnz DRAW_SQUARE
    ld a, e
    add a, 23
    ld e, a
    jr nc, DRAW_NEXT
    inc d
DRAW_NEXT:
    ld a, c
    add a, 17
    ld c, a
    cp 128
    jr nz, DRAW_ROW
    ret

; E counts candidate destinations; CHECK tests attacks without a move list.
GENERATE:
    ld e, 0
    ld a, (FROM)
    ld l, a
    ld h, 32
    ld a, (SIDE)
    xor (hl)
    and 8
    ret nz
    ld a, (hl)
    and 7
    ret z
    cp 1
    jr z, PAWN
    push af
    ld bc, 0x0801
    ld hl, DIRECTIONS + 8
    cp 2
    jr z, GEN_DIRECTION
    ld hl, DIRECTIONS
    cp 6
    jr z, GEN_DIRECTION
    ld c, 7
    cp 5
    jr z, GEN_DIRECTION
    ld b, 4
    cp 4
    jr z, GEN_DIRECTION
    ld hl, DIRECTIONS + 4
GEN_DIRECTION:
    ld a, (FROM)
    push bc
GEN_RAY:
    add a, (hl)
    ld d, a
    and 0x88
    jr nz, GEN_STOP
    push hl
    ld l, d
    ld h, 32
    ld a, (hl)
    or a
    jr z, GEN_EMPTY
    and 7
    cp 6
    jr z, GEN_BLOCKED
    ld a, (SIDE)
    xor (hl)
    and 8
    jr z, GEN_BLOCKED
    ld a, d
    call APPEND
GEN_BLOCKED:
    pop hl
GEN_STOP:
    pop bc
    inc hl
    djnz GEN_DIRECTION
    pop af
    cp 6
    ret nz
    jp CASTLES
GEN_EMPTY:
    ld a, d
    call APPEND
    pop hl
    dec c
    jr nz, GEN_RAY
    jr GEN_STOP
APPEND_TARGET:
    ld a, (TARGET)
APPEND:
    push hl
    ld h, 34
    ld l, e
    ld (hl), a
    inc e
    pop hl
    ret
PAWN:
    ld bc, 0x1010
    ld a, (SIDE)
    or a
    jr z, PAWN_DIRECTION
    ld bc, 0x60f0
PAWN_DIRECTION:
    ld a, (FROM)
    add a, c
    call EMPTY
    jr nz, PAWN_CAPTURES
    call APPEND
    ld d, a
    ld a, (FROM)
    and 0x70
    cp b
    jr nz, PAWN_CAPTURES
    ld a, d
    add a, c
    call EMPTY
    call z, APPEND
PAWN_CAPTURES:
    ld a, (FROM)
    add a, c
    dec a
    ld d, a
    ld b, 2
PAWN_CAPTURE:
    ld a, d
    and 0x88
    jr nz, PAWN_NEXT
    ld l, d
    ld h, 32
    ld a, (EP)
    cp d
    jr z, PAWN_ADD
    ld a, (hl)
    and 7
    jr z, PAWN_NEXT
    cp 6
    jr z, PAWN_NEXT
    ld a, (SIDE)
    xor (hl)
    and 8
    jr z, PAWN_NEXT
PAWN_ADD:
    ld a, d
    call APPEND
PAWN_NEXT:
    inc d
    inc d
    djnz PAWN_CAPTURE
    ret
EMPTY:
    ld l, a
    ld h, 32
    and 0x88
    ret nz
    or (hl)
    ld a, l
    ret

; Reverse rays test attacks directly; pawn pushes and castling are never attacks.
CHECK:
    ld a, (SIDE)
    or 6
    ld c, a
    ld hl, BOARD
CHECK_KING:
    ld a, (hl)
    and 15
    cp c
    jr z, KING_FOUND
    inc l
    jr CHECK_KING
KING_FOUND:
    ld a, l
ATTACK:
    ld (TARGET), a
    push bc
    push de
    push hl
    ld de, DIRECTIONS
    ld b, 16
ATTACK_DIRECTION:
    ld a, (TARGET)
    ld l, a
    ld h, 32
    ld c, 0
ATTACK_RAY:
    ld a, (de)
    add a, l
    ld l, a
    and 0x88
    jr nz, ATTACK_NEXT
    inc c
    ld a, (hl)
    or a
    jr z, ATTACK_EMPTY
    ld a, (SIDE)
    xor (hl)
    and 8
    jr z, ATTACK_NEXT
    ld a, b
    cp 9
    ld a, (hl)
    jr nc, ATTACK_SLIDER
    and 7
    cp 2
    jr z, ATTACK_YES
    jr ATTACK_NEXT
ATTACK_SLIDER:
    and 7
    cp 5
    jr z, ATTACK_YES
    push af
    ld a, b
    cp 13
    jr c, ATTACK_DIAGONAL
    pop af
    cp 4
    jr z, ATTACK_YES
    jr ATTACK_ADJACENT
ATTACK_DIAGONAL:
    pop af
    cp 3
    jr z, ATTACK_YES
ATTACK_ADJACENT:
    dec c
    jr nz, ATTACK_NEXT
    cp 6
    jr z, ATTACK_YES
    cp 1
    jr nz, ATTACK_NEXT
    ld a, b
    cp 13
    jr nc, ATTACK_NEXT
    ld a, b
    ; Rays 9/10 find black pawns, 11/12 white. Only bit 3 matters.
    sub 11
    ld l, 128
    xor (hl)
    and 8
    jr nz, ATTACK_YES
ATTACK_NEXT:
    inc de
    djnz ATTACK_DIRECTION
    or a
    jr ATTACK_RETURN
ATTACK_EMPTY:
    ld a, b
    cp 9
    jr nc, ATTACK_RAY
    jr ATTACK_NEXT
ATTACK_YES:
    scf
ATTACK_RETURN:
    pop hl
    pop de
    pop bc
    ret

CASTLES:
    ld a, (FROM)
    ld l, a
    ld h, 32
    ld a, (hl)
    and 16
    ret nz
    push de
    call CHECK
    pop de
    ret c
    ld bc, 0x0107
    call CASTLE_ONE
    ld bc, 0xff00
CASTLE_ONE:
    ld a, (FROM)
    and 0x70
    or c
    ld l, a
    ld h, 32
    ld a, (SIDE)
    or 4
    cp (hl)
    ret nz
    ld a, (FROM)
    ld d, a
CASTLE_EMPTY:
    ld a, l
    sub b
    ld l, a
    cp d
    jr z, CASTLE_SAFE
    ld a, (hl)
    or a
    ret nz
    jr CASTLE_EMPTY
CASTLE_SAFE:
    ; Vacate E before probing transit/destination to expose sliding attacks.
    ld c, (hl)
    ld (hl), 0
    ld a, l
    add a, b
    call ATTACK
    jr c, CASTLE_RESTORE
    ld a, (TARGET)
    add a, b
    call ATTACK
    call nc, APPEND_TARGET
CASTLE_RESTORE:
    ld (hl), c
    ret

MAKE_PAWN:
    ld a, (EP)
    cp e
    jr nz, MAKE_PROMOTION
    ld a, e
    xor l
    and 7
    xor l
    push hl
    ld l, a
    ld (hl), 0
    pop hl
MAKE_PROMOTION:
    call IS_PROMOTION
    jr nz, MAKE_DOUBLE
    ld a, c
    and 8
    or 16
    ld b, a
    ld a, (PROMOTION)
    or b
    ld (de), a
MAKE_DOUBLE:
    ld a, e
    sub l
    cp 32
    jr z, MAKE_EP
    cp 224
    jr nz, MAKE_DONE
MAKE_EP:
    ld a, e
    add a, l
    srl a
    jr SAVE_EP
BEST_MOVE:
    ld hl, BEST_FROM
    ld de, FROM
    ld bc, 3
    ldir
MAKE:
    ld hl, BOARD
    ld de, BACKUP
    ld bc, 130
    ldir
    ld a, (FROM)
    ld l, a
    ld h, 32
    ld c, (hl)
    ld (hl), 0
    ld a, (TO)
    ld e, a
    ld d, h
    ld a, c
    or 16
    ld (de), a
    ld a, c
    and 7
    cp 1
    jr z, MAKE_PAWN
    cp 6
    jr nz, MAKE_DONE
    ld a, e
    sub l
    cp 2
    ld b, 7
    jr z, MAKE_CASTLE
    cp 254
    jr nz, MAKE_DONE
    ld b, 0
MAKE_CASTLE:
    ld a, e
    add a, l
    srl a
    ld e, a
    ld a, l
    and 0x70
    or b
    ld l, a
    ld a, (hl)
    or 16
    ld (de), a
    ld (hl), 0
MAKE_DONE:
    xor a
SAVE_EP:
    ld (EP), a
FLIP:
    ld a, (SIDE)
    xor 8
    ld (SIDE), a
    ret
IS_PROMOTION:
    push hl
    ld a, (FROM)
    ld l, a
    ld h, 33
    ld a, (hl)
    and 7
    cp 1
    jr nz, PROMOTION_RETURN
    ld a, (TO)
    and 0x70
    jr z, PROMOTION_RETURN
    cp 0x70
PROMOTION_RETURN:
    pop hl
    ret
RESTORE_TRIAL:
    ld hl, BACKUP
    ld de, BOARD
    ld bc, 130
    ldir
    ret
TRY_MOVE:
    call MAKE
    call FLIP
    call CHECK
    push af
    call FLIP
    pop af
    ret

SEARCH:
    xor a
    ld (BEST_SCORE), a
    ld (FROM), a
SEARCH_FROM:
    call GENERATE
    ld b, e
    ld a, b
    or a
    jr z, SEARCH_NEXT
    ld hl, MOVES
SEARCH_TO:
    ld a, (hl)
    ld (TO), a
    ld a, 5
    ld (PROMOTION), a
SEARCH_PROMOTION:
    push bc
    push hl
    call TRY_MOVE
    call nc, SCORE
    call RESTORE_TRIAL
    call IS_PROMOTION
    pop hl
    pop bc
    jr nz, SEARCH_DESTINATION
    ld a, (PROMOTION)
    dec a
    ld (PROMOTION), a
    cp 1
    jr nz, SEARCH_PROMOTION
SEARCH_DESTINATION:
    inc hl
    djnz SEARCH_TO
SEARCH_NEXT:
    ld a, (FROM)
    ; Increment and skip each off-board half-rank.
    add a, 9
    and 247
    ld (FROM), a
    cp 128
    jr nz, SEARCH_FROM
    ret

; Strategy:
; - Reward capturing valuable pieces.
; - Reward promotion to stronger pieces.
; - Penalize landing on an attacked square.
; - Give a bonus for checking the king.
; - Develop pawns, knights and bishops toward the centre.
; It chooses the highest score; ties favor the first move found.
; It doesn't examine the opponent's replies or plan combinations.
; It's a small, immediate-gain strategy designed to save bytes.
SCORE:
    ld a, (TO)
    ld l, a
    ld h, 33
    ld a, (hl)
    call VALUE
    add a, 64
    ld c, a
    ld h, 32
    ld a, (hl)
    call VALUE
    ld b, a
    call IS_PROMOTION
    jr nz, SCORE_POSITION
    ld a, c
    add a, b
    sub 4
    ld c, a
SCORE_POSITION:
    ld a, b
    cp 20
    jr nc, SCORE_ATTACK
    ; C3-F6 earns 1, the four middle squares earn 2. The 0x88 coordinates
    ; let both axes share each mask; first movement adds 1, below a pawn's 4.
    ld a, l
    add a, 0x22
    and 0x44
    cp 0x44
    jr nz, SCORE_DEVELOP
    inc c
    ld a, l
    add a, 0x11
    and 0x22
    jr nz, SCORE_DEVELOP
    inc c
SCORE_DEVELOP:
    ld a, (FROM)
    ld l, a
    inc h
    ld a, (hl)
    and 16
    jr nz, SCORE_ATTACK
    inc c
SCORE_ATTACK:
    call FLIP
    ld a, (TO)
    call ATTACK
    jr nc, SCORE_CHECK
    ld a, c
    sub b
    ld c, a
SCORE_CHECK:
    call FLIP
    push bc
    call CHECK
    pop bc
    jr nc, SCORE_KEEP
    ld a, c
    add a, 8
    ld c, a
SCORE_KEEP:
    ld a, (BEST_SCORE)
    cp c
    ret nc
    ld a, c
    ld (BEST_SCORE), a
    ld hl, FROM
    ld de, BEST_FROM
    ld bc, 3
    ldir
    ret
VALUE:
    push hl
    and 7
    ld hl, VALUES
    add a, l
    ld l, a
    ld a, (hl)
    pop hl
    ret
BACK_RANK:
    db 4,2,3,5,6,3,2,4
DIRECTIONS:
    db 255,1,240,16,239,241,15,17,223,225,238,242,14,18,31,33
GLYPHS:
    db '.', 'P', 'N', 'B', 'R', 'Q', 'K'
VALUES:
    db 0,4,12,12,20,36,40
FILE_LABELS:
    db "HGFEDCBA"
HELP:
    db "BLACK E7E5"
PROMOTION_HELP:
    db "1Q2R3B4N"
DRAW_TEXT:
    db "DRAW"
MATE_TEXT:
    db "MATE"
END_CODE:
`;

if (typeof window !== 'undefined') window.CHESS_ASM = CHESS_ASM;
if (typeof module !== 'undefined' && module.exports) module.exports = CHESS_ASM;
