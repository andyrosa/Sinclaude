// Node launcher for the assembler test suite
// Usage: node run_asm_tests_node.js
require("./node_test_globals.js");
const passed = new Z80AssemblerTestClass().runAllTests();
process.exit(passed ? 0 : 1);
