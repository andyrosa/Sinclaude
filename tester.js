/**
 * Common Test Framework Base Class
 * Provides shared functionality for all test classes
 */
class TestFramework {
  constructor(testName = "Test") {
    this.testName = testName;
    this.testCount = 0;
    this.passedCount = 0;
    this.failedTests = [];

    // Detect if running in Node.js vs browser
    this.isNode = typeof module !== "undefined" && module.exports;
  }

  // Core test assertion method
  assert(condition, testName, details = "") {
    this.testCount++;
    if (condition) {
      this.passedCount++;
      consoleLogIfNode(`PASS ${testName}`);
    } else {
      this.failedTests.push({ name: testName, details });
      console.error(`FAIL ${testName} - ${details}`);
    }
  }

  // Print comprehensive test results
  printResults() {
    consoleLogIfNode("\n" + "=".repeat(60));
    consoleLogIfNode(`${this.testName.toUpperCase()} TEST RESULTS SUMMARY`);
    consoleLogIfNode("=".repeat(60));
    consoleLogIfNode(`Total tests: ${this.testCount}`);
    consoleLogIfNode(`Passed: ${this.passedCount}`);
    consoleLogIfNode(`Failed: ${this.testCount - this.passedCount}`);
    consoleLogIfNode(
      `Success rate: ${((this.passedCount / this.testCount) * 100).toFixed(1)}%`
    );

    if (this.failedTests.length > 0) {
      consoleLogIfNode("\nFAILED TESTS:");
      this.failedTests.forEach((test, i) => {
        consoleLogIfNode(`${i + 1}. ${test.name}`);
      });
    }

    if (this.passedCount === this.testCount) {
      consoleLogIfNode(
        `\nALL TESTS PASSED! The ${this.testName} fully implements the specification.`
      );
    }
  }

  // Helper method to check if all tests passed
  allTestsPassed() {
    return this.passedCount === this.testCount;
  }

  // Get failure count
  getFailureCount() {
    return this.testCount - this.passedCount;
  }

  // Reset test state (useful for running multiple test suites)
  reset() {
    this.testCount = 0;
    this.passedCount = 0;
    this.failedTests = [];
  }

  // Helper functions for consistent hex formatting
  formatHex8(value) {
    return value.toString(16).padStart(2, "0").toUpperCase();
  }

  formatHex16(value) {
    return value.toString(16).padStart(4, "0").toUpperCase();
  }

  // Common dependency loading for test classes
  loadDependencies(dependencyNames) {
    const dependencies = {};
    
    if (typeof require !== "undefined") {
      // Node.js environment
      try {
        for (const depName of dependencyNames) {
          if (depName === "TestFramework") {
            dependencies[depName] = require("./tester.js");
          } else {
            // Assume dependency file name matches: Z80CPU -> z80_cpu_emulator.js, Z80Assembler -> z80_assembler.js
            const fileName = depName === "Z80CPU" ? "./z80_cpu_emulator.js" : 
                           depName === "Z80Assembler" ? "./z80_assembler.js" : 
                           `./${depName.toLowerCase()}.js`;
            dependencies[depName] = require(fileName);
          }
        }
      } catch (error) {
        throw new Error(`Failed to load dependencies in Node.js: ${error.message}`);
      }
    } else {
      // Browser environment - classes should be globally available
      for (const depName of dependencyNames) {
        if (typeof window !== "undefined" && window[depName]) {
          dependencies[depName] = window[depName];
        } else if (typeof global !== "undefined" && global[depName]) {
          dependencies[depName] = global[depName];
        } else {
          // Check direct global access
          if (typeof eval !== "undefined") {
            try {
              const globalDep = eval(depName);
              if (typeof globalDep !== "undefined") {
                dependencies[depName] = globalDep;
                continue;
              }
            } catch (e) {
              // Ignore eval errors
            }
          }
          throw new Error(`${depName} class not available in browser environment - ensure ${depName.toLowerCase()}.js is loaded`);
        }
      }
    }
    
    return dependencies;
  }

  // Common test completion pattern
  completeTests() {
    this.printResults();
    return this.allTestsPassed();
  }
}

// Export for use in other modules (Node.js environment)
if (typeof module !== "undefined" && module.exports) {
  module.exports = TestFramework;
}

// Also make available as global for browser use
if (typeof window !== "undefined") {
  window.TestFramework = TestFramework;
}