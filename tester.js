/**
 * Common Test Framework Base Class
 * Provides shared functionality for all test classes
 */
class TestFramework {
  // sinks: { log(message), fail(message) } - where progress and failures go.
  // The host decides (terminal in Node, on-page console in the browser).
  constructor(testName, sinks) {
    this.testName = testName;
    this.sinks = sinks;
    this.testCount = 0;
    this.passedCount = 0;
    this.failedTests = [];
  }

  // Core test assertion method
  assert(condition, testName, details = "") {
    this.testCount++;
    if (condition) {
      this.passedCount++;
      this.sinks.log(`PASS ${testName}`);
    } else {
      this.failedTests.push({ name: testName, details });
      this.sinks.fail(`FAIL ${testName} - ${details}`);
    }
  }

  // Print comprehensive test results
  printResults() {
    const log = this.sinks.log;
    log("\n" + "=".repeat(60));
    log(`${this.testName.toUpperCase()} TEST RESULTS SUMMARY`);
    log("=".repeat(60));
    log(`Total tests: ${this.testCount}`);
    log(`Passed: ${this.passedCount}`);
    log(`Failed: ${this.testCount - this.passedCount}`);
    log(
      `Success rate: ${((this.passedCount / this.testCount) * 100).toFixed(1)}%`
    );

    if (this.failedTests.length > 0) {
      log("\nFAILED TESTS:");
      this.failedTests.forEach((test, i) => {
        log(`${i + 1}. ${test.name}`);
      });
    }

    if (this.passedCount === this.testCount) {
      log(
        `\nALL TESTS PASSED! The ${this.testName} fully implements the specification.`
      );
    }
  }

  // Helper method to check if all tests passed
  allTestsPassed() {
    return this.passedCount === this.testCount;
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