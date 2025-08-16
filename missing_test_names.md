# Missing Test Names for Z80 CPU Emulator

## Increment/Decrement Operations
1. `LD B, 0FFH; INC B` → **"Increment B register with overflow"**
2. `LD HL, 1; DEC HL` → **"Decrement HL register pair"**
3. `LD HL, 0; DEC HL` → **"Decrement HL with underflow"**
4. `LD HL, 100H; DEC HL` → **"Decrement HL from 0x100"**
5. `LD BC, 1; DEC BC` → **"Decrement BC register pair"**
6. `LD BC, 0; DEC BC` → **"Decrement BC with underflow"**
7. `LD DE, 200H; DEC DE` → **"Decrement DE register pair"**
8. `LD SP, 2000H; DEC SP` → **"Decrement stack pointer"**

## Addition Operations
9. `LD HL, 0FFFFH; LD BC, 1; ADD HL, BC` → **"Add BC to HL with overflow"**
10. `LD HL, 8000H; LD DE, 8000H; ADD HL, DE` → **"Add DE to HL overflow test"**
11. `LD HL, 8000H; ADD HL, HL` → **"Add HL to itself overflow test"**
12. `LD HL, 1; LD SP, 0FFFFH; ADD HL, SP` → **"Add SP to HL"**
13. `LD A, 7FH; LD B, 3; ADD A, B` → **"Add B to A boundary test"**
14. `LD A, 0FFH; LD B, 1; ADD A, B` → **"Add B to A with carry"**
15. `LD A, 80H; LD B, 80H; ADD A, B` → **"Add B to A signed overflow"**
16. `LD A, 80H; ADD A, A` → **"Add A to itself overflow test"**
17. `LD A, 80H; LD H, 80H; SCF; ADC A, H` → **"Add H to A with carry set"**
18. `SCF; ADC A, 0` → **"Add immediate to A with carry"**

## Subtraction Operations
19. `LD A, 0FFH; LD B, 80H; SUB B` → **"Subtract B from A underflow test"**
20. `LD A, 80H; LD B, 0FFH; SUB B` → **"Subtract B from A borrow test"**
21. `LD A, 0FFH; LD B, 0FFH; SUB B` → **"Subtract B from A equal values"**
22. `LD A, 80H; LD H, 1; SUB H` → **"Subtract H from A"**
23. `LD A, 80H; SUB 0FFH` → **"Subtract immediate from A borrow test"**
24. `LD A, 0FFH; SUB A` → **"Subtract A from itself"**
25. `LD A, 05H; LD B, 10H; SBC A, B` → **"Subtract B from A with borrow"**
26. `LD A, 05H; SBC A, A` → **"Subtract A from itself with borrow"**

## Logical Operations - AND
27. `LD A, 7FH; LD B, 80H; AND B` → **"AND A with B complementary bits"**
28. `LD A, 0FFH; LD B, 7FH; AND B` → **"AND A with B mask operation"**
29. `LD A, 0FFH; LD B, 80H; AND B` → **"AND A with B single bit"**
30. `LD A, 0FFH; AND A` → **"AND A with itself"**
31. `LD HL, 123CH; LD (HL), 0FH; LD A, 0F0H; AND (HL)` → **"AND A with memory at HL"**
32. `LD A, 0FFH; AND 7FH` → **"AND A with immediate mask"**

## Logical Operations - OR
33. `LD A, 7FH; LD B, 80H; OR B` → **"OR A with B complementary bits"**
34. `LD B, 0; OR B` → **"OR A with zero in B"**
35. `LD A, 80H; OR A` → **"OR A with itself"**
36. `LD HL, 123DH; LD (HL), 01H; LD A, 80H; OR (HL)` → **"OR A with memory at HL"**
37. `LD A, 7FH; OR 80H` → **"OR A with immediate value"**

## Logical Operations - XOR and Compare
38. `LD A, 0FFH; XOR A` → **"XOR A with itself"**
39. `LD A, 7FH; XOR 80H` → **"XOR A with immediate value"**
40. `LD A, 0FFH; CP 0FFH` → **"Compare A with equal value"**
41. `LD A, 80H; CP 0FFH` → **"Compare A less than immediate"**
42. `LD A, 0FFH; CP 80H` → **"Compare A greater than immediate"**
43. `LD B, 0FFH; CP B` → **"Compare A with B register"**
44. `LD HL, 123EH; LD (HL), 80H; LD A, 80H; CP (HL)` → **"Compare A with memory at HL"**

## Miscellaneous Operations
45. `LD A, 80H; NEG` → **"Negate A register value"**
46. `SCF; CCF` → **"Set then complement carry flag"**
47. `LD A, 7FH; CPL` → **"Complement A register"**

## Bit Rotation and Shifts
48. `LD A, 80H; RLCA` → **"Rotate A left circular with carry"**
49. `LD A, 0FFH; RLCA` → **"Rotate A left circular all bits set"**
50. `LD A, 80H; SLA A` → **"Shift A left arithmetic"**
51. `LD B, 0FFH; SRA B` → **"Shift B right arithmetic"**
52. `LD C, 01H; SRL C` → **"Shift C right logical"**
53. `LD HL, 123FH; LD (HL), 01H; SLA (HL)` → **"Shift memory left arithmetic"**
54. `LD HL, 1240H; LD (HL), 01H; SRA (HL)` → **"Shift memory right arithmetic"**
55. `LD HL, 1241H; LD (HL), 80H; SRL (HL)` → **"Shift memory right logical"**

## Bit Operations
56. `LD A, 01H; BIT 0, A` → **"Test bit 0 of A register set"**
57. `LD A, 0; BIT 0, A` → **"Test bit 0 of A register clear"**
58. `LD A, 80H; BIT 7, A` → **"Test bit 7 of A register set"**
59. `LD A, 0; BIT 7, A` → **"Test bit 7 of A register clear"**
60. `LD A, 40H; BIT 6, A` → **"Test bit 6 of A register set"**
61. `LD E, 80H; BIT 7, E` → **"Test bit 7 of E register"**
62. `LD D, 00H; BIT 7, D` → **"Test bit 7 of D register clear"**

## More Bit Rotations
63. `LD A, 80H; RLA` → **"Rotate A left through carry"**
64. `LD A, 01H; RRA` → **"Rotate A right through carry"**
65. `LD A, 01H; RRCA` → **"Rotate A right circular"**
66. `LD A, 80H; RLC A` → **"Rotate A left circular extended"**
67. `LD B, 01H; RRC B` → **"Rotate B right circular extended"**
68. `LD A, 80H; RL A` → **"Rotate A left through carry extended"**
69. `LD B, 01H; RR B` → **"Rotate B right through carry extended"**

## Bit Set/Reset Operations
70. `LD A, 00H; SET 0, A` → **"Set bit 0 of A register"**
71. `LD B, 00H; SET 7, B` → **"Set bit 7 of B register"**
72. `LD HL, 1240H; LD (HL), 00H; SET 0, (HL)` → **"Set bit 0 of memory at HL"**
73. `LD A, 0FFH; RES 0, A` → **"Reset bit 0 of A register"**
74. `LD B, 0FFH; RES 7, B` → **"Reset bit 7 of B register"**
75. `LD HL, 1240H; LD (HL), 0FFH; RES 0, (HL)` → **"Reset bit 0 of memory at HL"**

## Block Transfer Operations
76. `LD HL, 1240H; ...; LDIR` → **"Load and increment repeat operation"**
77. `LD HL, 1242H; ...; LDIR` → **"Load and increment repeat with different source"**

## Stack Operations
78. `LD SP, 1246H; ...; POP BC` → **"Pop BC from stack"**
79. `LD SP, 1248H; ...; POP HL` → **"Push and pop HL register pair"**
80. `LD SP, 1248H; ...; POP DE` → **"Push and pop DE register pair"**
81. `LD SP, 1248H; ...; POP AF` → **"Push and pop AF with flags"**

## Jump Operations
82. `CP 0; JR Z, 5` → **"Conditional jump relative if zero"**
83. `CP 1; JR NZ, 5` → **"Conditional jump relative if not zero"**
84. `SCF; JR C, 7` → **"Conditional jump relative if carry"**
85. `SCF; JR NC, 7` → **"Conditional jump relative if no carry"**
86. `LD B, 2; DJNZ 5` → **"Decrement B and jump if not zero"**
87. `LD B, 1; DJNZ 5` → **"Decrement B to zero and jump test"**

## Absolute Jump Operations
88. `CP 0; JP Z, 1234H` → **"Conditional jump absolute if zero"**
89. `CP 0; JP NZ, 1234H` → **"Conditional jump absolute if not zero"**
90. `SCF; JP C, 1234H` → **"Conditional jump absolute if carry"**
91. `SCF; JP NC, 1234H` → **"Conditional jump absolute if no carry"**

## Return Operations
92. `LD SP, 1248H; ...; RET` → **"Return from subroutine"**
93. `CP 0; ...; RET Z` → **"Conditional return if zero"**
94. `CP 0; RET NZ` → **"Conditional return if not zero"**
95. `SCF; ...; RET C` → **"Conditional return if carry"**
96. `SCF; RET NC` → **"Conditional return if no carry"**

## I/O Operations
97. `LD A, 0FFH; OUT (7FH), A; LD A, 0; IN A, (7FH)` → **"Output and input port operation"**