const SPACE_INVADER_ASM = `
ORG 0

start:
  JR init_game

;constants
FALSE               EQU 0
TRUE                EQU -1

KBD_FIRE            EQU ' '
KBD_LEFT            EQU 'A'
KBD_RIGHT           EQU 'D'
KBD_QUIT            EQU 12
KBD_RESTART         EQU 'W'
KBD_INVISIBLE       EQU 'W'
KBD_NO_KEY_PRESSED  EQU -1

SCREEN_BASE         EQU 60000
SCREEN_COLS         EQU 32
SCREEN_ROWS         EQU 24
SCREEN_BLANK_CHAR   EQU ' '
RIGHTMOST_COL       EQU SCREEN_COLS-1
SCREEN_SIZE         EQU SCREEN_COLS * SCREEN_ROWS
BOTTOM_ROW          EQU SCREEN_ROWS-1
MESSAGE_ROW         EQU SCREEN_ROWS/2

FRAME_COUNT_PORT    EQU 0
KEYBOARD_PORT       EQU 1
BEEP_10HZ_PORT      EQU 2
BEEP_MS_PORT        EQU 3

MISSILE_BEEP_10HZ   EQU 160
MISSILE_BEEP_MS     EQU 2

BOMB_BEEP_10HZ      EQU 20
BOMB_BEEP_MS        EQU 4

PLAYER_ROW          EQU SCREEN_ROWS-3
PLAYER_START_COL    EQU SCREEN_COLS/2
INITIAL_INVADER_ROW EQU 0
INVADER_START_COL   EQU 1
MISSILE_OFF_ROW     EQU SCREEN_ROWS
MOVE_RIGHT          EQU 1

PLAYER_MIN_COL      EQU 1
PLAYER_MAX_COL      EQU RIGHTMOST_COL-1

BOMB_DROP_THRESHOLD EQU 26
FRAME_DELAY_COUNT   EQU 2

LEVEL_INCREMENT     EQU 3
INVADER_MOVE_DELAY  EQU 2

;vars allocated and set to starting values even tho they get overwritten on init_game
player_col:             DB PLAYER_START_COL
invader_col:            DB INVADER_START_COL
invader_start_row:      DB INITIAL_INVADER_ROW
invader_row:            DB INITIAL_INVADER_ROW
invader_dir:            DB MOVE_RIGHT
missile_col:            DB 0
missile_row:            DB MISSILE_OFF_ROW
missile_active:         DB FALSE
bomb_col:               DB 0
bomb_row:               DB 0
is_bomb_active:         DB FALSE
game_over:              DB FALSE
player_won:             DB FALSE
invisible_mode:         DB FALSE
random_seed:            DB 0
invader_move_delay_cnt: DB 0

init_game:
  LD   A, PLAYER_START_COL
  LD   (player_col), A
  LD   A, INVADER_START_COL
  LD   (invader_col), A
  
  LD   A, (player_won)
  AND  A
  JR   Z, reset_invader_position
  
  ; Player won - advance to next level
  LD   A, (invader_start_row)
  ADD  A, LEVEL_INCREMENT
  CP   PLAYER_ROW - 2
  JR   C, set_new_start_row
  LD   A, INITIAL_INVADER_ROW
  JR   set_new_start_row
  
reset_invader_position:
  ; Aliens won - reset to initial position
  LD   A, INITIAL_INVADER_ROW
  
set_new_start_row:
  LD   (invader_start_row), A
  LD   (invader_row), A
  
  LD   A, MOVE_RIGHT
  LD   (invader_dir), A
  XOR  A
  LD   (missile_col), A
  LD   A, MISSILE_OFF_ROW
  LD   (missile_row), A
  XOR  A
  LD   (missile_active), A
  LD   (bomb_col), A
  LD   (bomb_row), A
  LD   (is_bomb_active), A
  LD   (game_over), A
  LD   (player_won), A
  LD   (invisible_mode), A
  LD   (invader_move_delay_cnt), A

game_loop:
  LD   A, (game_over)
  AND  A
  JP   NZ, end_game

  CALL game_delay
  CALL handle_keyboard
  CALL update_player_missile
  CALL update_invader_bomb
  CALL update_invader
  CALL draw_game
  CALL check_collisions

  JR   game_loop

handle_keyboard:
  IN   A, (KEYBOARD_PORT)
  CP   KBD_NO_KEY_PRESSED
  RET  Z

  CP   KBD_LEFT
  JR   Z, move_player_left

  CP   KBD_RIGHT
  JR   Z, move_player_right

  CP   KBD_FIRE
  JR   Z, fire_missile

  CP   KBD_QUIT
  JR   Z, quit_game

  CP   KBD_INVISIBLE
  RET  NZ

  LD   A, (invisible_mode)
  CPL
  LD   (invisible_mode), A
  RET

move_player_left:
  LD   A, (player_col)
  CP   PLAYER_MIN_COL
  RET  Z
  DEC  A
  LD   (player_col), A
  RET

move_player_right:
  LD   A, (player_col)
  CP   PLAYER_MAX_COL
  RET  Z
  INC  A
  LD   (player_col), A
  RET

fire_missile:
  LD   A, (missile_active)
  AND  A
  RET  NZ
  LD   A, (player_col)
  LD   (missile_col), A
  LD   A, PLAYER_ROW - 1
  LD   (missile_row), A
  LD   A, TRUE
  LD   (missile_active), A
  
  ; Play missile sound
  LD   A, MISSILE_BEEP_10HZ
  OUT  (BEEP_10HZ_PORT), A
  LD   A, MISSILE_BEEP_MS 
  OUT  (BEEP_MS_PORT), A
  RET

quit_game:
  LD   A, TRUE
  LD   (game_over), A
  RET

update_player_missile:
  LD   A, (missile_active)
  AND  A
  RET  Z
  LD   A, (missile_row)
  AND  A
  JR   Z, deactivate_missile
  DEC  A
  LD   (missile_row), A
  RET

deactivate_missile:
  XOR  A
  LD   (missile_active), A
  RET

update_invader_bomb:
  LD   A, (is_bomb_active)
  AND  A
  RET  Z
  LD   A, (bomb_row)
  CP   PLAYER_ROW + 1
  JR   Z, deactivate_bomb
  INC  A
  LD   (bomb_row), A
  RET

deactivate_bomb:
  XOR  A
  LD   (is_bomb_active), A
  RET

update_invader:
  LD   A, (invader_move_delay_cnt)
  INC  A
  LD   (invader_move_delay_cnt), A
  CP   INVADER_MOVE_DELAY
  RET  NZ
  
  ; Reset counter after delay reached
  XOR  A
  LD   (invader_move_delay_cnt), A
  
  LD   A, (invader_row)
  CP   PLAYER_ROW
  JR   Z, invader_reached_player

  LD   A, (invader_dir)
  LD   B, A
  LD   A, (invader_col)
  ADD  A, B

  AND  A
  JR   Z, invader_hit_left
  CP   SCREEN_COLS
  JR   Z, invader_hit_right

  LD   (invader_col), A
  JR   random_bomb_drop

invader_hit_left:
  LD   A, (invader_row)
  INC  A
  LD   (invader_row), A

  LD   A, (invader_dir)
  NEG
  LD   (invader_dir), A

  XOR  A
  LD   (invader_col), A
  JR   random_bomb_drop

invader_hit_right:
  LD   A, (invader_row)
  INC  A
  LD   (invader_row), A

  LD   A, (invader_dir)
  NEG
  LD   (invader_dir), A

  LD   A, RIGHTMOST_COL
  LD   (invader_col), A

random_bomb_drop:
  LD   A, (is_bomb_active)
  AND  A
  RET  NZ
  LD   A, (random_seed)
  CP   BOMB_DROP_THRESHOLD
  RET  NC
  LD   A, (invader_col)
  LD   (bomb_col), A
  LD   A, (invader_row)
  INC  A
  LD   (bomb_row), A
  LD   A, TRUE
  LD   (is_bomb_active), A
  
  ; Play bomb sound
  LD   A, BOMB_BEEP_10HZ
  OUT  (BEEP_10HZ_PORT), A
  LD   A, BOMB_BEEP_MS 
  OUT  (BEEP_MS_PORT), A
  RET

invader_reached_player:
  XOR  A
  LD   (player_won), A
  LD   A, TRUE
  LD   (game_over), A
  RET

check_collisions:
  LD   A, (missile_active)
  AND  A
  JR   Z, check_bomb_collision

  LD   A, (missile_row)
  LD   B, A
  LD   A, (invader_row)
  CP   B
  JR   NZ, check_missile_bomb_collision

  LD   A, (missile_col)
  LD   B, A

  LD   A, (invader_col)
  DEC  A
  CP   B
  JR   Z, missile_hit_invader

  LD   A, (invader_col)
  CP   B
  JR   Z, missile_hit_invader

  LD   A, (invader_col)
  INC  A
  CP   B
  JR   Z, missile_hit_invader

  JR   check_missile_bomb_collision

missile_hit_invader:
  XOR  A
  LD   (missile_active), A
  LD   A, TRUE
  LD   (player_won), A
  LD   A, TRUE
  LD   (game_over), A
  RET

check_missile_bomb_collision:
  LD   A, (is_bomb_active)
  AND  A
  JR   Z, check_bomb_collision

  LD   A, (missile_col)
  LD   B, A
  LD   A, (bomb_col)
  CP   B
  JR   NZ, check_bomb_collision

  LD   A, (missile_row)
  LD   B, A
  LD   A, (bomb_row)
  CP   B
  JR   NZ, check_bomb_collision

  XOR  A
  LD   (missile_active), A
  LD   (is_bomb_active), A

check_bomb_collision:
  LD   A, (is_bomb_active)
  AND  A
  RET  Z

  LD   A, (invisible_mode)
  AND  A
  RET  NZ

  LD   A, (bomb_row)
  CP   PLAYER_ROW
  RET  NZ

  LD   A, (bomb_col)
  LD   B, A

  LD   A, (player_col)
  DEC  A
  CP   B
  JR   Z, bomb_hit_player

  INC  A
  CP   B
  JR   Z, bomb_hit_player

  INC  A
  CP   B
  JR   Z, bomb_hit_player

  RET

bomb_hit_player:
  XOR  A
  LD   (player_won), A
  LD   A, TRUE
  LD   (game_over), A
  RET

draw_game:
  CALL clear_screen

  LD   A, (invader_col)
  DEC  A
  LD   B, A
  LD   A, (invader_row)
  LD   C, A
  LD   A, B
  LD   B, C
  LD   C, '<'
  CALL draw_char

  LD   A, (invader_col)
  LD   B, A
  LD   A, (invader_row)
  LD   C, A
  LD   A, B
  LD   B, C
  LD   C, '*'
  CALL draw_char

  LD   A, (invader_col)
  INC  A
  LD   B, A
  LD   A, (invader_row)
  LD   C, A
  LD   A, B
  LD   B, C
  LD   C, '>'
  CALL draw_char

  LD   A, (invisible_mode)
  AND  A
  JR   NZ, skip_player_draw

  LD   A, (player_col)
  DEC  A
  LD   B, PLAYER_ROW
  LD   C, '['
  CALL draw_char

  LD   A, (player_col)
  LD   B, PLAYER_ROW
  LD   C, 'O'
  CALL draw_char

  LD   A, (player_col)
  INC  A
  LD   B, PLAYER_ROW
  LD   C, ']'
  CALL draw_char

skip_player_draw:
  CALL draw_controls
  LD   A, (missile_active)
  AND  A
  JR   Z, draw_bomb
  LD   A, (missile_col)
  PUSH AF
  LD   A, (missile_row)
  LD   B, A
  POP  AF
  LD   C, '|'
  CALL draw_char

draw_bomb:
  LD   A, (is_bomb_active)
  AND  A
  RET  Z
  LD   A, (bomb_col)
  PUSH AF
  LD   A, (bomb_row)
  LD   B, A
  POP  AF
  LD   C, 'o'
  CALL draw_char
  RET

draw_char:
  PUSH AF
  LD   A, B
  LD   H, 0
  LD   L, A
  LD   DE, 0
  LD   B, A
  AND  A
  JR   Z, add_screen_base 
char_mult_loop:
  LD   A, E
  ADD  A, SCREEN_COLS
  LD   E, A
  LD   A, D
  ADC  A, 0
  LD   D, A
  DJNZ char_mult_loop
add_screen_base:
  LD   HL, SCREEN_BASE
  ADD  HL, DE
  POP  AF
  LD   E, A
  LD   D, 0
  ADD  HL, DE
  LD   (HL), C
  RET

print_string:
  LD   A, (DE)
  LD   (HL), A
  INC  HL
  INC  DE
  DJNZ print_string
  RET

draw_controls:
  LD   HL, SCREEN_BASE + (BOTTOM_ROW * SCREEN_COLS)
  LD   DE, controls_msg
  LD   B, len(controls_msg)
  CALL print_string
  RET

clear_screen:
  LD   HL, SCREEN_BASE
  LD   BC, SCREEN_SIZE
clear_loop:
  LD   (HL), SCREEN_BLANK_CHAR
  INC  HL
  DEC  BC
  LD   A, B
  OR   C
  JR   NZ, clear_loop
  RET


game_delay:
  CALL inc_random_seed
  IN   A, (FRAME_COUNT_PORT)
  CP   FRAME_DELAY_COUNT
  JR   C, game_delay

delay_done:
  XOR  A
  OUT  (FRAME_COUNT_PORT), A
  RET

inc_random_seed:
  LD   A, (random_seed)
  INC  A
  LD   (random_seed), A
  RET

end_game:
  LD   A, (player_won)
  AND  A
  JR   NZ, SCREEN_humans_won

SCREEN_invaders_won:
  LD   DE, invaders_won_msg
  LD   B, len(invaders_won_msg)
  JR   SCREEN_end_message

SCREEN_humans_won:
  LD   DE, humans_won_msg
  LD   B, len(humans_won_msg)

SCREEN_end_message:
  LD   HL, SCREEN_BASE + (MESSAGE_ROW * SCREEN_COLS)
  CALL print_string

SCREEN_show_press_to_play:
  LD   HL, SCREEN_BASE + (BOTTOM_ROW * SCREEN_COLS)
  LD   DE, press_to_play
  LD   B, len(press_to_play)
  CALL print_string

wait_for_key:
  CALL inc_random_seed
  IN   A, (KEYBOARD_PORT)
  CP   KBD_RESTART
  JR   NZ, wait_for_key

wait_for_key_release:
  CALL inc_random_seed
  IN   A, (KEYBOARD_PORT)
  CP   KBD_NO_KEY_PRESSED
  JR   NZ, wait_for_key_release

  JP   init_game

humans_won_msg:   DB "          HUMANS WON!           "
invaders_won_msg: DB "         Invader won :(         "
press_to_play:    DB "     PRESS W TO PLAY AGAIN      "
controls_msg:     DB "   A=LEFT D=RIGHT SPACE=FIRE    "

  END start

`;

// Export for Node.js if running in Node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SPACE_INVADER_ASM;
}