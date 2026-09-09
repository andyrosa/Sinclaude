// Node launcher for the CPU test suite
// Usage: node run_cpu_tests_node.js
require("./node_test_globals.js");
const passed = new Z80CPUEmulatorTestClass().runAllTests();
process.exit(passed ? 0 : 1);
