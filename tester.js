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