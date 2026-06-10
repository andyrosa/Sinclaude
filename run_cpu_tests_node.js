// Node launcher for the CPU test suite: provides the globals the browser normally hosts
// Usage: node run_cpu_tests_node.js
global.consoleLogIfNode = (message) => console.log(message);
global.TestFramework = require("./tester.js");

const Z80CPUEmulatorTestClass = require("./z80_cpu_emulator_test_runner.js");
const passed = new Z80CPUEmulatorTestClass().runAllTests();
process.exit(passed ? 0 : 1);
