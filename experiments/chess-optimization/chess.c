/* C translation of the current independent chess_asm.js for LLVM size tests.
 * Same 0x88 representation, move order and one-ply evaluation. No ROM services.
 * Fixed workspace matches the assembly so allocated state is not hidden in ROM.
 */
typedef unsigned char u8;
#define board ((u8 *)0x2000)
#define backup ((u8 *)0x2100)
#define moves ((u8 *)0x2200)
#define side board[128]
#define ep board[129]
#define from board[130]
#define to board[131]
#define promotion board[132]
#define best_score board[133]
#define best_from board[134]
#define best_to board[135]
#define best_promotion board[136]
#define screen ((volatile u8 *)60000)
static const u8 directions[] = {255,1,240,16,239,241,15,17,223,225,238,242,14,18,31,33};
static const u8 values[] = {0,4,12,12,20,36,40};
static const u8 back_rank[] = {4,2,3,5,6,3,2,4};
static const u8 glyphs[] = {27,53,51,39,55,54,48};
extern u8 key_input(void);

u8 attack(u8 target) {
    for (u8 i=0; i<16; ++i) {
        u8 square=target, distance=0;
        for (;;) {
            square += directions[i];
            if (square & 0x88) break;
            ++distance;
            u8 piece=board[square], type=piece&7;
            if (!piece) { if (i>=8) break; else continue; }
            if (!((piece^side)&8)) break;
            if (i>=8) { if (type==2) return 1; break; }
            if (type==5 || type==(i<4 ? 4 : 3)) return 1;
            if (distance==1) {
                if (type==6) return 1;
                if (type==1 && i>=4 && ((i<6 ? 8 : 0)==side)) return 1;
            }
            break;
        }
    }
    return 0;
}
u8 check(void) {
    u8 king=side|6, square=0;
    while ((board[square]&15)!=king) ++square;
    return attack(square);
}
u8 is_promotion(void) {
    return (backup[from]&7)==1 && (!(to&0x70) || (to&0x70)==0x70);
}
void restore(void) {
    for (u8 i=0; i<130; ++i) board[i]=backup[i];
}
void make(void) {
    for (u8 i=0; i<130; ++i) backup[i]=board[i];
    u8 piece=board[from], type=piece&7, next_ep=0;
    board[from]=0;
    board[to]=piece|16;
    if (type==1) {
        if (to==ep) board[(from&0x70)|(to&7)]=0;
        if (is_promotion()) board[to]=(piece&8)|16|promotion;
        u8 delta=to-from;
        if (delta==32 || delta==224) next_ep=(to+from)/2;
    } else if (type==6) {
        u8 delta=to-from;
        if (delta==2 || delta==254) {
            u8 rook=(from&0x70)|(delta==2 ? 7 : 0);
            board[(to+from)/2]=board[rook]|16;
            board[rook]=0;
        }
    }
    ep=next_ep;
    side^=8;
}
u8 generate(void) {
    u8 count=0, piece=board[from], type=piece&7;
    if (((piece^side)&8) || !type) return 0;
    if (type==1) {
        u8 step=side ? 240 : 16, square=from+step;
        if (!(square&0x88) && !board[square]) {
            moves[count++]=square;
            if ((from&0x70)==(side ? 0x60 : 0x10)) {
                square+=step;
                if (!(square&0x88) && !board[square]) moves[count++]=square;
            }
        }
        square=from+step-1;
        for (u8 n=0; n<2; ++n, square+=2) {
            u8 target=board[square], t=target&7;
            if (!(square&0x88) && (square==ep || (t && t!=6 && ((target^side)&8)))) moves[count++]=square;
        }
    } else {
        u8 first=type==2 ? 8 : type==3 ? 4 : 0;
        u8 end=type==2 ? 16 : type==4 ? 4 : 8;
        for (u8 i=first; i<end; ++i) {
            u8 square=from;
            for (u8 n=0; n<((type==2 || type==6) ? 1 : 7); ++n) {
                square+=directions[i];
                if (square&0x88) break;
                u8 target=board[square];
                if (target) {
                    if ((target&7)!=6 && ((target^side)&8)) moves[count++]=square;
                    break;
                }
                moves[count++]=square;
            }
        }
        if (type==6 && !(piece&16) && !check()) {
            for (u8 i=0; i<2; ++i) {
                u8 rook=(from&0x70)|(i ? 0 : 7), step=i ? 255 : 1;
                if (board[rook]!=(side|4)) continue;
                u8 square=rook;
                do { square-=step; } while (square!=from && !board[square]);
                if (square!=from) continue;
                board[from]=0;
                square=from+step;
                if (!attack(square) && !attack(square+step)) moves[count++]=square+step;
                board[from]=piece;
            }
        }
    }
    return count;
}
u8 try_move(void) {
    make(); side^=8;
    u8 illegal=check();
    side^=8;
    return illegal;
}
void score(void) {
    u8 score=64+values[backup[to]&7], value=values[board[to]&7];
    if (is_promotion()) score+=value-4;
    if (value<20) {
        if (((u8)(to+0x22)&0x44)==0x44) {
            ++score;
            if (!((u8)(to+0x11)&0x22)) ++score;
        }
        if (!(backup[from]&16)) ++score;
    }
    side^=8;
    if (attack(to)) score-=value;
    side^=8;
    if (check()) score+=8;
    if (score>best_score) {
        best_score=score; best_from=from; best_to=to; best_promotion=promotion;
    }
}
void search(void) {
    best_score=0;
    for (from=0; from<128; from=(from+9)&247) {
        u8 count=generate();
        for (u8 i=0; i<count; ++i) {
            to=moves[i]; promotion=5;
            do {
                if (!try_move()) score();
                restore();
                if (!is_promotion()) break;
            } while (--promotion!=1);
        }
    }
}
void draw(void) {
    for (u8 rank=0; rank<8; ++rank) {
        screen[32+rank*32]=29+rank;
        for (u8 file=0; file<8; ++file) {
            u8 piece=board[rank*16+7-file];
            screen[33+rank*32+file]=glyphs[piece&7]|((piece&8)<<4);
        }
    }
}
u8 key(u8 first, u8 count) {
    u8 c;
    do { c=key_input(); } while ((u8)(c-first)>=count);
    return c;
}
u8 read_square(u8 at) {
    u8 file=key(38,8); screen[at+320]=file;
    u8 rank=key(29,8); screen[at+321]=rank;
    return (rank-29)*16+file-38;
}
void chess_start(void) {
    for (unsigned i=0; i<768; ++i) screen[i]=0;
    for (u8 i=0; i<130; ++i) board[i]=0;
    for (u8 i=0; i<8; ++i) {
        board[i]=back_rank[i]; board[112+i]=back_rank[i]|8;
        board[16+i]=1; board[96+i]=9; screen[1+i]=45-i;
    }
    static const u8 help[]={39,49,38,40,48,0,42,35,42,33};
    static const u8 promos[]={29,54,30,55,31,39,32,51};
    for (u8 i=0; i<10; ++i) screen[288+i]=help[i];
    for (u8 i=0; i<8; ++i) screen[352+i]=promos[i];
    for (;;) {
        draw(); search();
        if (!best_score) {
            static const u8 endings[]={41,55,38,60,50,38,57,42};
            u8 offset=check() ? 4 : 0;
            for (u8 i=0; i<4; ++i) screen[320+i]=endings[offset+i];
            for (;;) {}
        }
        if (!side) {
            from=best_from; to=best_to; promotion=best_promotion; make();
        } else {
            screen[324]=0;
            for (;;) {
                for (u8 i=0; i<4; ++i) screen[320+i]=22;
                from=read_square(0); to=read_square(2);
                u8 count=generate(), i=0;
                while (i<count && moves[i]!=to) ++i;
                if (i<count) {
                    promotion=5;
                    u8 illegal=try_move(); restore();
                    if (!illegal) break;
                }
                screen[324]=15;
            }
            if (is_promotion()) {
                screen[324]=53;
                u8 choice=key(29,4); screen[324]=choice; promotion=34-choice;
            }
            make();
        }
    }
}
