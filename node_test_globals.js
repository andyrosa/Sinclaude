// In the browser, <script> tags make every module a global; the Node launchers
// require this file once so the same names exist on `global` in the same order.
Object.assign(global, require("./constants_and_css_vars.js"));
global.consoleLogIfNode = (message) => console.log(message);
global.TestFramework = require("./tester.js");
global.Z80Assembler = require("./z80_assembler.js");
global.Z80CPU = require("./z80_cpu_emulator.js");
global.runZ80CPUEmulatorTestClass = require("./z80_cpu_emulator_test_cases.js");
global.Z80AssemblerTestClass = require("./z80_assembler_test.js");
global.Z80CPUEmulatorTestClass = require("./z80_cpu_emulator_test_runner.js");
