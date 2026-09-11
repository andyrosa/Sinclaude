// The catalog supplies source and labels; simulator settings belong to the user.
const SIMULATOR_SAMPLES = {
  defaultSampleId: "characterSet",
  samples: [
    { id: "characterSet", name: "Character Set Test", source: CHARACTER_SET_ASM },
    { id: "basics", name: "Debugger Test", source: BASICS_ASM },
    { id: "performance", name: "Performance Test", source: DEFAULT_ASM },
    { id: "spaceInvader", name: "'Space Invader'", source: SPACE_INVADER_ASM },
    { id: "claudasaur", name: "'Claudasaur'", source: CLAUDASAUR_ASM },
    { id: "chess", name: "'1.3K Chess'", source: CHESS_ASM },
  ],
};
