// Node launcher for the assembler test suite: provides the globals the browser normally hosts
// Usage: node run_asm_tests_node.js
global.consoleLogIfNode = (message) => console.log(message);
global.TestFramework = require("./tester.js");

const Z80AssemblerTestClass = require("./z80_assembler_test.js");
const passed = new Z80AssemblerTestClass().runAllTests();
process.exit(passed ? 0 : 1);
