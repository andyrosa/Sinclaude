// Console output functionality
function clearConsole() {
    document.getElementById('console').textContent = '';
}

// User message functionality - shows in UI console but not browser console
function userMessage(message) {
    const consoleDiv = document.getElementById('console');
    const timestamp = new Date().toLocaleTimeString();
    const line = `${timestamp} [USER] ${message}\n`;
    consoleDiv.textContent += line;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// Bug detection messages - both user and console logging for debugging
function userMessageAboutBug(userMsg, consoleMsg) {
    console.error(`BUG: ${consoleMsg}`);
    userMessage(`BUG: ${userMsg}`);
}

// Helper to parse string as truthy value
function isTruthy(value) {
    if (!value) return false;
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === 'y' || lower === '1' || lower === 'on';
}

// Override only console.log to catch unapproved usage
const originalConsole = {
    log: console.log
};

console.log = function (...args) {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    userMessageAboutBug('using unapproved console.log', message);
    originalConsole.log(...args);
};

// Approved console logging function for internal use
// NOTE: Keep this function even if unused - it's part of the console logging infrastructure
// This is specifically for console.log - for console.error, use originalConsole.error directly
function consoleLogApproved(...args) {
    originalConsole.log(...args);
}
