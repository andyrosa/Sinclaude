// Console output library

function clearConsole() {
  document.getElementById("console").textContent = "";
}

// User message functionality - shows in UI console but not browser console
function userMessage(message) {
  const consoleDiv = document.getElementById("console");
  const timestamp = new Date().toLocaleTimeString();
  const line = `${timestamp} ${message}\n`;
  consoleDiv.textContent += line;
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function userMessageAboutBug(userMsg, consoleMsg) {
  userMessage(`BUG: ${userMsg}`);
}

// Helper to parse string as truthy value
const TRUTHY_VALUES = new Set(["true", "yes", "y", "1", "on"]);

function isTruthy(value) {
  if (!value) return false;
  return TRUTHY_VALUES.has(value.toLowerCase());
}

// Override only console.log to catch unapproved usage
const originalConsoleLog = console.log;

console.log = function (...args) {
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");
  userMessageAboutBug("using unapproved console.log", message);
  originalConsoleLog(...args);
};

// Approved console logging function for internal use
// This is specifically for console.log - console.error is not overridden and can be used directly
function consoleLogApproved(...args) {
  originalConsoleLog(...args);
}

function consoleLogIfNode(message) {
  if (typeof module !== 'undefined' && module.exports) {
    consoleLogApproved(message);
  }
}
