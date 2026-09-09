// Geometry is compiled to ordinary Z80 data. Movement, drawing, input and the
// breadth-first monster pursuit all execute inside the emulated CPU.
const CLAUDASAUR_ASM = (() => {
  const duration = typeof module !== 'undefined' && module.exports
    ? require('./constants_and_css_vars.js').encodeBeepDuration : encodeBeepDuration;
  const art = [];
  const packet = (name, pixels) => {
    art.push(`${name}:`);
    for (const [offset, value] of pixels) {
      art.push(`  DEFW BUFFER+${offset}\n  DB ${value}`);
    }
    art.push('  DEFW 0');
  };
  const text = (name, row, message) => {
    if (message.length > 32) throw new Error(`Claudasaur text exceeds screen width: ${name}`);
    packet(name, Array.from(message, (char, col) => [row * 32 + col, char.charCodeAt(0)]));
  };
  const sprite = [
    '   #   #   #    ',
    '    #  #  #  #  ',
    ' #  ## # ## #   ',
    '  ##########    ',
    '############### ',
    '   #########    ',
    '##### # # ##### ',
    '   #########    ',
    '  ###########   ',
    ' #  ## # ##  #  ',
    '#  ##  #  ##  # ',
    '   ##     ##    ',
    '  ###     ###   ',
  ];
  const spritePixels = (scale, centerY) => {
    const pixels = new Map();
    sprite.forEach((line, y) => Array.from(line).forEach((char, x) => {
      if (char === '#') pixels.set((Math.round(centerY + (y - 6) * scale)) * 32 + Math.round(15 + (x - 7) * scale), 128 + 32);
    }));
    return [...pixels];
  };
  packet('mascot', spritePixels(1, 9));
  for (let depth = 0; depth < 4; depth++) {
    packet(`monster_${depth}`, spritePixels([1, 0.65, 0.4, 0.23][depth], 12));
    const x = [0, 5, 9, 12, 14], top = [2, 5, 7, 8, 9], bottom = [21, 18, 16, 15, 14];
    for (const side of ['left', 'right']) {
      for (const wall of [0, 1]) {
        const pixels = new Map();
        const put = (col, row, char) => pixels.set(row * 32 + (side === 'left' ? col : 31 - col), char.charCodeAt(0));
        for (let col = x[depth]; col <= x[depth + 1]; col++) {
          const ratio = (col - x[depth]) / (x[depth + 1] - x[depth]);
          const upper = wall ? Math.round(top[depth] + ratio * (top[depth + 1] - top[depth])) : top[depth + 1];
          const lower = wall ? Math.round(bottom[depth] + ratio * (bottom[depth + 1] - bottom[depth])) : bottom[depth + 1];
          put(col, upper, wall ? (side === 'left' ? '\\' : '/') : '-');
          put(col, lower, wall ? (side === 'left' ? '/' : '\\') : '-');
          if (col === x[depth + 1]) for (let row = upper; row <= lower; row++) put(col, row, '|');
        }
        packet(`${side}_${wall}_${depth}`, [...pixels]);
      }
    }
    const front = [];
    for (let row = top[depth + 1]; row <= bottom[depth + 1]; row++) {
      for (let col = x[depth + 1]; col <= 31 - x[depth + 1]; col++) {
        front.push([row * 32 + col, (row === top[depth + 1] || row === bottom[depth + 1] ? '-' : col === x[depth + 1] || col === 31 - x[depth + 1] ? '|' : (row % 3 === 0 ? '-' : ' ')).charCodeAt(0)]);
      }
    }
    packet(`front_${depth}`, front);
    text(`exit_${depth}`, 11, ' '.repeat(13) + 'EXIT');
  }
  text('heading', 0, '       C L A U D A S A U R');
  text('intro_1', 17, ' FIND THE EXIT. AVOID THE SPIKES');
  text('intro_2', 19, ' W/S MOVE   A/D TURN   P PAUSE');
  text('intro_3', 21, '       SPACE TO ENTER MAZE');
  text('help', 23, 'W/S MOVE A/D TURN SPACE MAP P=II');
  text('bearing', 22, ' FACING:   MAP: @ YOU * BEAST E');
  text('waiting', 1, '   CLAUDASAUR IS WAKING UP...');
  text('hunting', 1, '   CLAUDASAUR IS HUNTING YOU');
  text('nearby', 1, '   FOOTSTEPS ARE GETTING LOUDER');
  text('danger', 1, '   RUN! CLAUDASAUR IS CLOSE!');
  text('paused_text', 1, '       PAUSED - P TO RESUME');
  text('won_text', 18, '    YOU ESCAPED THE CLAUDASAUR!');
  text('lost_text', 18, '    CLAUDASAUR CAUGHT YOU!');
  text('retry_text', 21, '       SPACE TO PLAY AGAIN');
  const maze = [
    '################',
    '#......#......E#',
    '#.####.#.####..#',
    '#.#....#....#..#',
    '#.#.######.##..#',
    '#.#........#...#',
    '#.#####.####.#.#',
    '#.....#......#.#',
    '#####.###.####.#',
    '#...#...#......#',
    '#.#.###.######.#',
    '#.#.....#......#',
    '#.#######.####.#',
    '#..............#',
    '#.############.#',
    '################',
  ];
  return `; CLAUDASAUR - a first-person ZX81 monster maze
; A Claude-logo-inspired starburst with very hungry dinosaur feet.
; W/S or up/down: move. A/D or left/right: turn.
; Space: start/retry, or toggle live map. P: pause/resume.
; Map legend: @ you, * Claudasaur, E exit. North is up.
; The monster wakes after six seconds, then takes a step every 1.2s.
; Nearby: heartbeat pairs, faster in danger. Capture falls; escape rises.
; The title screen loops the broom theme from The Sorcerer's Apprentice.
; Sounds advance on game ticks, so melodies never block movement or retry.
; Rendering uses a back buffer; no JavaScript game logic is required.
ORG 0
  JP title
BUFFER EQU 50176
DIST EQU 49152
QUEUE EQU 49408
player: DB 17
monster: DB 225
direction: DB 1
last_key: DB 255
key: DB 255
state: DB 0
paused: DB 0
map_on: DB 0
countdown: DB 60
distance: DB 255
sound_pointer: DEFW 0
sound_wait: DB 0
heart_phase: DB 0
head: DB 0
tail: DB 0
cell: DB 0
cost: DB 0
ray: DB 0
depth: DB 0
seen: DB 255
delta: DB 0
deltas: DB 240,1,16,255
compass: DB 'N','E','S','W'

title:
  LD SP,65535
  XOR A
  LD (state),A
  CALL sound_reset
  CALL clear
  LD HL,heading
  CALL paint
  LD HL,mascot
  CALL paint
  LD HL,intro_1
  CALL paint
  LD HL,intro_2
  CALL paint
  LD HL,intro_3
  CALL paint
  CALL present
  LD HL,title_music
  LD (sound_pointer),HL
  ; Give the browser time to display the title before the first note.
  LD A,3
  LD (sound_wait),A
  JP wait_key

start_game:
  LD A,17
  LD (player),A
  LD A,225
  LD (monster),A
  LD A,1
  LD (direction),A
  LD (state),A
  XOR A
  LD (paused),A
  LD (map_on),A
  CALL sound_reset
  LD A,60
  LD (countdown),A
  LD A,255
  LD (distance),A
  CALL render

wait_key:
  XOR A
  OUT (0),A
frame_wait:
  IN A,(0)
  CP 6
  JR C,frame_wait
  IN A,(1)
  LD (key),A
  LD B,A
  LD A,(last_key)
  LD C,A
  LD A,B
  LD (last_key),A
  LD A,(state)
  CP 1
  JP Z,playing
  LD A,B
  CP C
  JR Z,menu_tick
  CP ' '
  JP Z,start_game
menu_tick:
  CALL sound_tick
  JR wait_key

playing:
  LD A,B
  CP C
  JR Z,held_key
  CP 'P'
  JR NZ,check_map
  LD A,(paused)
  XOR 1
  LD (paused),A
check_map:
  LD A,B
  CP ' '
  JR NZ,held_key
  LD A,(map_on)
  XOR 1
  LD (map_on),A
held_key:
  LD A,(paused)
  OR A
  JP NZ,draw_tick
  LD A,B
  CP 'W'
  JR Z,forward
  CP 145
  JR Z,forward
  CP 'S'
  JR Z,backward
  CP 147
  JR Z,backward
  CP C
  JP Z,tick
  CP 'A'
  JR Z,turn_left
  CP 144
  JR Z,turn_left
  CP 'D'
  JR Z,turn_right
  CP 146
  JR Z,turn_right
  JP tick
turn_left:
  LD A,(direction)
  DEC A
  JR turn
turn_right:
  LD A,(direction)
  INC A
turn:
  AND 3
  LD (direction),A
  JP tick
backward:
  LD A,(direction)
  ADD A,2
  JR move
forward:
  LD A,(direction)
move:
  CALL get_delta
  LD B,A
  LD A,(player)
  ADD A,B
  LD B,A
  CALL read_cell
  CP 1
  JR Z,tick
  LD A,B
  LD (player),A
  CALL collision
  LD A,(state)
  CP 1
  JP NZ,wait_key
  LD A,(player)
  CALL read_cell
  CP 2
  JP Z,win
tick:
  LD HL,countdown
  DEC (HL)
  JR NZ,draw_tick
  LD (HL),12
  CALL hunt
  CALL collision
  LD A,(state)
  CP 1
  JP NZ,wait_key
draw_tick:
  CALL sound_tick
  CALL render
  JP wait_key

collision:
  LD A,(player)
  LD B,A
  LD A,(monster)
  CP B
  RET NZ
  LD A,3
  LD (state),A
  LD HL,lost_text
  JP finish
win:
  LD A,2
  LD (state),A
  LD HL,won_text
  CALL finish
  JP wait_key
finish:
  PUSH HL
  CALL clear
  LD HL,heading
  CALL paint
  LD HL,mascot
  CALL paint
  POP HL
  CALL paint
  LD HL,retry_text
  CALL paint
  CALL sound_reset
  LD HL,capture_sound
  LD A,(state)
  CP 2
  JR NZ,finish_sound
  LD HL,escape_sound
finish_sound:
  LD (sound_pointer),HL
  CALL sound_tick
  JP present

; One note per tick at most: the host samples ports after CPU batches, so
; consecutive OUT pairs without yielding would overwrite unheard notes.
sound_reset:
  XOR A
  LD (sound_wait),A
  LD (heart_phase),A
  LD HL,0
  LD (sound_pointer),HL
  OUT (2),A
  OUT (3),A
  LD A,85
  OUT (4),A
  RET
sound_tick:
  LD HL,(sound_pointer)
  LD A,H
  OR L
  JR NZ,sound_sequence
  LD A,(state)
  CP 1
  RET NZ
  LD A,(paused)
  OR A
  JR NZ,heart_reset
  LD A,(distance)
  CP 7
  JR NC,heart_reset
  LD B,12
  CP 4
  JR NC,heart_period
  LD B,6
heart_period:
  LD A,(heart_phase)
  LD C,A
  INC A
  CP B
  JR C,heart_store
  XOR A
heart_store:
  LD (heart_phase),A
  LD A,C
  OR A
  JR Z,heart_first
  CP 2
  RET NZ
  LD A,50
  OUT (4),A
  LD A,12
  OUT (2),A
  LD A,${duration(65)}
  OUT (3),A
  RET
heart_first:
  LD A,75
  OUT (4),A
  LD A,16
  OUT (2),A
  LD A,${duration(55)}
  OUT (3),A
  RET
heart_reset:
  XOR A
  LD (heart_phase),A
  RET

; Notes contain pitch / 10 Hz, volume, encoded duration, and delay ticks.
; Port 3 duration: milliseconds = 4000^((byte-1)/254), or zero for no request.
; A zero pitch ends the sequence; only the title theme loops. Terminal sounds
; replace the heartbeat, and starting/retrying discards all pending notes.
sound_sequence:
  LD A,(sound_wait)
  OR A
  JR Z,sound_note
  DEC A
  LD (sound_wait),A
  RET NZ
sound_note:
  LD A,(HL)
  OR A
  JR Z,sound_end
  LD B,A
  INC HL
  LD A,(HL)
  OUT (4),A
  LD A,B
  OUT (2),A
  INC HL
  LD A,(HL)
  OUT (3),A
  INC HL
  LD A,(HL)
  LD (sound_wait),A
  INC HL
  LD (sound_pointer),HL
  RET
sound_end:
  LD A,(state)
  OR A
  JP NZ,sound_reset
  LD HL,title_music
  JR sound_note
; Paul Dukas, The Sorcerer's Apprentice (1897), bassoons, rehearsal 7.
; Source: https://s9.imslp.org/files/imglnks/usimg/b/b3/IMSLP35118-PMLP15848-Dukas-SorcerersAppr.Bassoons.pdf
; Start at the C-D-natural-E-natural pickup, then eight bars of the broom
; theme. Raise it one octave for clearer beeps; round pitches to 10 Hz.
; Each eighth lasts two ticks (3/8, dotted-quarter = 100). A four-tick
; delay includes the written eighth rest between F and Ab. Short gates
; preserve the staccato march, with accents below the volume-85 ceiling.
; The pickup and eight bars loop in 5.4 seconds.
title_music:
  DB 26,54,${duration(120)},2, 29,56,${duration(120)},2, 33,60,${duration(120)},2
  DB 35,74,${duration(150)},4, 42,64,${duration(120)},2
  DB 35,72,${duration(150)},4, 42,62,${duration(120)},2
  DB 39,68,${duration(120)},2, 35,62,${duration(120)},2, 33,56,${duration(120)},2
  DB 35,74,${duration(150)},4, 42,64,${duration(120)},2
  DB 35,72,${duration(150)},4, 42,62,${duration(120)},2
  DB 39,68,${duration(120)},2, 35,62,${duration(120)},2, 33,56,${duration(120)},2
  DB 35,74,${duration(150)},4, 42,64,${duration(120)},2
  DB 35,70,${duration(120)},2, 42,66,${duration(120)},2, 39,60,${duration(120)},2, 0
capture_sound: DB 64,85,${duration(80)},2, 42,75,${duration(90)},2, 26,65,${duration(100)},2, 12,55,${duration(240)},3, 0
escape_sound: DB 52,55,${duration(100)},2, 66,65,${duration(100)},2, 78,85,${duration(240)},3, 0

; A cell index uses one byte: y*16+x. The sealed border ensures that
; traversable cells never wrap around the edges during neighbor expansion.
read_cell:
  PUSH HL
  LD L,A
  LD H,78
  LD A,(HL)
  POP HL
  RET
get_delta:
  PUSH HL
  PUSH DE
  AND 3
  LD E,A
  LD D,0
  LD HL,deltas
  ADD HL,DE
  LD A,(HL)
  POP DE
  POP HL
  RET

; BFS from the player lets the monster navigate around walls and dead ends.
; Both queue and distance arrays are page aligned to keep indexing cheap.
hunt:
  LD HL,DIST
  LD DE,DIST+1
  LD BC,255
  LD (HL),255
  LDIR
  XOR A
  LD (head),A
  LD A,(player)
  LD L,A
  LD H,192
  LD (HL),0
  LD (QUEUE),A
  LD A,1
  LD (tail),A
bfs_loop:
  LD A,(tail)
  LD B,A
  LD A,(head)
  CP B
  JR Z,bfs_done
  LD L,A
  LD H,193
  INC A
  LD (head),A
  LD A,(HL)
  LD (cell),A
  LD L,A
  LD H,192
  LD A,(HL)
  INC A
  LD (cost),A
  LD A,(cell)
  SUB 16
  CALL visit
  LD A,(cell)
  INC A
  CALL visit
  LD A,(cell)
  ADD A,16
  CALL visit
  LD A,(cell)
  DEC A
  CALL visit
  JR bfs_loop
visit:
  LD E,A
  CALL read_cell
  CP 1
  RET Z
  LD L,E
  LD H,192
  LD A,(HL)
  CP 255
  RET NZ
  LD A,(cost)
  LD (HL),A
  LD A,(tail)
  LD L,A
  LD H,193
  LD (HL),E
  INC A
  LD (tail),A
  RET
bfs_done:
  LD A,(monster)
  LD L,A
  LD H,192
  LD A,(HL)
  LD (distance),A
  LD B,A
  LD C,0
choose_step:
  LD A,C
  CALL get_delta
  LD E,A
  LD A,(monster)
  ADD A,E
  LD L,A
  LD H,192
  LD A,(HL)
  CP B
  JR C,take_step
  INC C
  LD A,C
  CP 4
  JR NZ,choose_step
  RET
take_step:
  LD (distance),A
  LD A,L
  LD (monster),A
  RET

clear:
  LD HL,BUFFER
  LD DE,BUFFER+1
  LD BC,767
  LD (HL),' '
  LDIR
  RET
present:
  LD HL,BUFFER
  LD DE,60000
  LD BC,768
  LDIR
  RET
; Each drawing packet is a list of destination words and character bytes.
paint:
  LD E,(HL)
  INC HL
  LD D,(HL)
  INC HL
  LD A,D
  OR E
  RET Z
  LD A,(HL)
  INC HL
  LD (DE),A
  JR paint
; A selects a word entry in a packet pointer table at HL.
paint_index:
  ADD A,A
  LD E,A
  LD D,0
  ADD HL,DE
  LD E,(HL)
  INC HL
  LD D,(HL)
  EX DE,HL
  JP paint

render:
  CALL clear
  LD HL,heading
  CALL paint
  LD HL,help
  CALL paint
  LD HL,bearing
  CALL paint
  LD A,(direction)
  LD E,A
  LD D,0
  LD HL,compass
  ADD HL,DE
  LD A,(HL)
  LD (BUFFER+712),A
  LD HL,hunting
  LD A,(distance)
  CP 255
  JR NZ,status_near
  LD HL,waiting
  JR status_pause
status_near:
  CP 7
  JR NC,status_pause
  LD HL,nearby
  CP 4
  JR NC,status_pause
  LD HL,danger
status_pause:
  LD A,(paused)
  OR A
  JR Z,status_draw
  LD HL,paused_text
status_draw:
  CALL paint
  LD A,(map_on)
  OR A
  JP NZ,draw_map
  LD A,(player)
  LD (ray),A
  XOR A
  LD (depth),A
  LD A,255
  LD (seen),A
ray_loop:
  LD A,(monster)
  LD B,A
  LD A,(ray)
  CP B
  JR NZ,ray_sides
  LD A,(depth)
  LD (seen),A
ray_sides:
  LD A,(direction)
  DEC A
  CALL get_delta
  LD B,A
  LD A,(ray)
  ADD A,B
  CALL read_cell
  AND 1
  LD B,A
  LD A,(depth)
  ADD A,A
  ADD A,B
  LD HL,left_table
  CALL paint_index
  LD A,(direction)
  INC A
  CALL get_delta
  LD B,A
  LD A,(ray)
  ADD A,B
  CALL read_cell
  AND 1
  LD B,A
  LD A,(depth)
  ADD A,A
  ADD A,B
  LD HL,right_table
  CALL paint_index
  LD A,(direction)
  CALL get_delta
  LD B,A
  LD A,(ray)
  ADD A,B
  LD (ray),A
  CALL read_cell
  CP 1
  JR Z,ray_wall
  CP 2
  JR Z,ray_exit
  LD HL,depth
  INC (HL)
  LD A,(HL)
  CP 4
  JP NZ,ray_loop
  JR ray_monster
ray_exit:
  LD HL,exit_table
  LD A,(depth)
  CALL paint_index
  JR ray_monster
ray_wall:
  LD HL,front_table
  LD A,(depth)
  CALL paint_index
ray_monster:
  LD A,(seen)
  CP 255
  JR Z,ray_done
  LD HL,monster_table
  CALL paint_index
ray_done:
  JP present

draw_map:
  LD HL,maze
  LD DE,BUFFER+104
  LD B,16
map_row:
  LD C,16
map_cell:
  LD A,(HL)
  OR A
  LD A,' '
  JR Z,map_put
  LD A,(HL)
  CP 2
  LD A,'E'
  JR Z,map_put
  LD A,160
map_put:
  LD (DE),A
  INC HL
  INC DE
  DEC C
  JR NZ,map_cell
  PUSH HL
  LD HL,16
  ADD HL,DE
  EX DE,HL
  POP HL
  DJNZ map_row
  LD A,(monster)
  CALL map_address
  LD (HL),'*'
  LD A,(player)
  CALL map_address
  LD (HL),'@'
  JP present
map_address:
  LD B,A
  AND 240
  LD L,A
  LD H,0
  ADD HL,HL
  LD A,B
  AND 15
  LD E,A
  LD D,0
  ADD HL,DE
  LD DE,BUFFER+104
  ADD HL,DE
  RET

left_table: DEFW ${Array.from({length:4}, (_, d) => `left_0_${d},left_1_${d}`).join(',')}
right_table: DEFW ${Array.from({length:4}, (_, d) => `right_0_${d},right_1_${d}`).join(',')}
front_table: DEFW front_0,front_1,front_2,front_3
monster_table: DEFW monster_0,monster_1,monster_2,monster_3
exit_table: DEFW exit_0,exit_1,exit_2,exit_3
${art.join('\n')}
; Page aligned map: read_cell uses H=78 (0x4E00).
ORG 19968
maze:
${maze.map(row => '  DB ' + Array.from(row, char => char === '#' ? 1 : char === 'E' ? 2 : 0).join(',')).join('\n')}
`;
})();

if (typeof window !== 'undefined') window.CLAUDASAUR_ASM = CLAUDASAUR_ASM;
if (typeof module !== 'undefined' && module.exports) module.exports = CLAUDASAUR_ASM;
