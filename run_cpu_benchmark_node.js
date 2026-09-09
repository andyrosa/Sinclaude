// Node launcher for the CPU throughput benchmark: runs the bundled programs on the
// working-tree emulator the way the simulator's run loop does and reports MIPS.
//
// Usage: node run_cpu_benchmark_node.js [--compare=PATH]
//   --compare=PATH   also run an alternative emulator file (for example one saved with
//                    "git show HEAD:z80_cpu_emulator.js > before.js") and print the ratio
//
// Every measurement runs in its own child process, and with --compare the two emulators
// alternate round by round: sharing one process lets JIT state and CPU boost favour
// whichever emulator runs second. Not a test: throughput depends on the machine, so there
// is no pass/fail threshold. Run-to-run noise on the same machine is about 5%.
const path = require("path");
const childProcess = require("child_process");
const { RUN_BATCH_INSTRUCTIONS } = require("./constants_and_css_vars.js");

const BENCHMARK_INSTRUCTIONS = 30 * 1000 * 1000;
const WARMUP_INSTRUCTIONS = 5 * 1000 * 1000; // lets the JIT settle before timing
const ROUNDS = 3; // the best round is reported; the others absorb scheduler noise
const FRAME_COUNT_PORT = 0; // advanced once per batch so wait-for-frame loops make progress
const COMPARE_ARGUMENT_PREFIX = "--compare=";
const WORKER_PROGRAM_PREFIX = "--worker-program=";
const WORKER_EMULATOR_PREFIX = "--worker-emulator=";
const WORKING_TREE_EMULATOR = path.join(__dirname, "z80_cpu_emulator.js");

// Program sources are resolved in the worker, after the globals are loaded
const PROGRAM_SOURCES = {
  "Space Invader": () => SPACE_INVADER_ASM,
  "Default program": () => DEFAULT_ASM,
  "JP 0 loop (in-page boot benchmark)": () => "ORG 0\nJP 0",
};

function argumentValue(prefix) {
  const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
  return argument === undefined ? null : argument.slice(prefix.length);
}

// --- Worker: one measurement, prints MIPS ---

function assembleInto(memory, source) {
  const result = new Z80Assembler().assemble(source);
  if (!result.success) {
    throw new Error(`Benchmark program failed to assemble: ${result.errors[0].message}`);
  }
  memory.fill(0);
  Z80Assembler.loadOpcodesIntoMemory(memory, result.instructionDetails);
  return result.loadAddress;
}

// Runs `instructions` instructions in simulator-sized batches and returns MIPS
function measureMips(EmulatorClass, source, instructions) {
  const memory = new Uint8Array(65536);
  const iomap = new Uint8Array(256);
  const loadAddress = assembleInto(memory, source);
  const cpu = new EmulatorClass();
  cpu.set(loadAddress, 0xffff);

  let executed = 0;
  const start = process.hrtime.bigint();
  while (executed < instructions) {
    const batch = cpu.executeSteps(memory, iomap, RUN_BATCH_INSTRUCTIONS);
    if (batch.error) {
      throw new Error(`CPU error during benchmark: ${batch.error}`);
    }
    if (batch.halted) {
      throw new Error("Benchmark program halted; a benchmark program must loop forever");
    }
    executed += batch.instructionsExecuted;
    iomap[FRAME_COUNT_PORT] = (iomap[FRAME_COUNT_PORT] + 1) & 0xff;
  }
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  return executed / seconds / 1e6;
}

function runWorker(programName, emulatorPath) {
  require("./node_test_globals.js");
  const EmulatorClass = require(emulatorPath);
  const source = PROGRAM_SOURCES[programName]();
  measureMips(EmulatorClass, source, WARMUP_INSTRUCTIONS);
  process.stdout.write(String(measureMips(EmulatorClass, source, BENCHMARK_INSTRUCTIONS)));
}

// --- Parent: schedules the workers and prints the table ---

function measureInChildProcess(programName, emulatorPath) {
  const result = childProcess.spawnSync(
    process.execPath,
    [__filename, `${WORKER_PROGRAM_PREFIX}${programName}`, `${WORKER_EMULATOR_PREFIX}${emulatorPath}`],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`Benchmark worker failed for '${programName}' with ${emulatorPath}:\n${result.stderr}`);
  }
  return Number(result.stdout);
}

function runParent() {
  const emulators = [{ label: "working tree", emulatorPath: WORKING_TREE_EMULATOR }];
  const comparePath = argumentValue(COMPARE_ARGUMENT_PREFIX);
  if (comparePath !== null) {
    const resolvedComparePath = path.resolve(comparePath);
    emulators.push({ label: `compare (${path.basename(resolvedComparePath)})`, emulatorPath: resolvedComparePath });
  }

  console.log(
    `${BENCHMARK_INSTRUCTIONS.toLocaleString()} instructions per measurement, batches of ${RUN_BATCH_INSTRUCTIONS}, best of ${ROUNDS} rounds, one process per measurement`
  );
  for (const programName of Object.keys(PROGRAM_SOURCES)) {
    const best = emulators.map(() => 0);
    for (let round = 0; round < ROUNDS; round++) {
      emulators.forEach(({ emulatorPath }, emulatorIndex) => {
        best[emulatorIndex] = Math.max(best[emulatorIndex], measureInChildProcess(programName, emulatorPath));
      });
    }
    const columns = emulators.map(({ label }, emulatorIndex) => `${label}: ${best[emulatorIndex].toFixed(1)} MIPS`);
    const ratioColumn = emulators.length > 1 ? `  (working tree / compare: ${(best[0] / best[1]).toFixed(2)}x)` : "";
    console.log(`${programName.padEnd(36)} ${columns.join("   ")}${ratioColumn}`);
  }
}

const workerProgram = argumentValue(WORKER_PROGRAM_PREFIX);
if (workerProgram !== null) {
  runWorker(workerProgram, argumentValue(WORKER_EMULATOR_PREFIX));
} else {
  runParent();
}
