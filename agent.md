### CRITICAL IMPLEMENTATION RULES

**Figure out first, change second**

**ALWAYS START AND END WITH A WORKING PROGRAM**

Every block of refactoring work must:
1. **Begin** with a functional, tested program
2. **End** with a functional, tested program  
3. **Test immediately** after each change to ensure nothing breaks
4. **Revert immediately** if any functionality is broken

Never leave the codebase in a broken state.

### NEVER RETURN FALLBACK VALUES

**If you cannot do the real thing, don't pretend you can by returning made-up data.**

**Bad examples:**
- Return 0 when parsing fails instead of failing the operation
- Return empty string when lookup fails instead of indicating failure  
- Use `?? 0` fallbacks that hide missing data instead of handling it properly

**Problems with fake returns:**
- **Masks bugs** - Problems propagate silently instead of being caught early
- **Creates invalid state** - System continues with wrong data leading to corruption
- **Misleads users** - Displays show fake values instead of indicating problems
- **Violates fail-fast principle** - Errors should be caught as early as possible

**Correct approaches:**
- **Fail explicitly** - Return error codes, throw exceptions, or report errors properly
- **Handle missing data explicitly** - Show "N/A", disable features, or prompt for required data
- **Validate inputs** - Check preconditions and reject invalid requests upfront

### Comment Guidelines

**Write comments for WHY, not WHAT**

**Bad comments** (describe what the code does):
```javascript
// Set PC to address  
this.registers.PC = address;

// Loop through all pixels
for (let i = 0; i < pixels.length; i++) {
```

**Good comments** (explain why/context):
```javascript
// Reset to program start address after CPU reset
this.registers.PC = address;

// Process pixels in batches to avoid blocking UI thread  
for (let i = 0; i < pixels.length; i++) {

// Calculate k so that the MIPS decays to 1/e in 1 second
// k = 1 - exp(-timeElapsed / tau), tau = 1s
const k = 1 - Math.exp(-timeElapsed / tau);
```

**Keep mathematical/algorithmic explanations** - Complex formulas, algorithms, or mathematical reasoning should be documented even if they describe "what" the code does, because the mathematical context is not obvious.

### Code Duplication Rules

**NEVER REPEAT CODE**

**Duplicate code causes work multiplication:**
1. **Reading overhead** - Developers must scan through duplicate logic
2. **Feature multiplication** - New features require changes in N places
3. **Maintenance multiplication** - Bug fixes must be applied N times  
4. **Inconsistency bugs** - Updating only 1 of N copies creates subtle bugs

**FIRST: Understand WHY there are duplicate calls - often indicates design problem**

**Process for handling duplicate code:**
1. **Investigate WHY** - Are these really the same operation or different contexts?
2. **Question the design** - Should both places be calling this code?
3. **Only then extract** - If both calls are truly necessary, create helper function

### User Request Handling

**NEVER silently ignore user requests**

If a user request cannot be fulfilled for any reason:
1. **Always use `console.log()`** to explain why the request was ignored
2. **Provide clear feedback** about what went wrong
3. **Suggest alternatives** when possible

**Bad**: Silently fail or ignore the request
**Good**: `console.log("Cannot execute: assembly not loaded")` + user feedback

Users should never wonder if their action was received or why nothing happened.

### Bug Detection and Reporting

**Use `userMessageAboutBug(userMsg, consoleMsg)` for all bug detection**

When detecting impossible states or unexpected conditions:
1. **Always report to both user and console** - bugs need user awareness AND developer debugging
2. **Separate user-friendly from technical messages**:
   - `userMsg`: Simple, actionable message for the user
   - `consoleMsg`: Technical details referencing actual code conditions

**Bad** (technical details shown to user):
```javascript
console.log("BUG: stepRequest() called while state === STATE.RUNNING");
userMessage("BUG: stepRequest() called while state === STATE.RUNNING");
```

**Good** (separated messages):  
```javascript
userMessageAboutBug("Use Break button to switch to stepping mode", "stepRequest() called while state === STATE.RUNNING");
```

**Technical message should reference exact code conditions:**
- `"called while runLoopId != null"` (good)
- `"called while already running"` (vague)
- `"called while state === STATE.RUNNING"` (good)
- `"called in wrong state"` (vague)

### Debugging Philosophy

**DO NOT add defensive code when debugging**

When encountering bugs or unexpected behavior:

**Bad** (defensive coding that hides the problem):
```javascript
if (timeElapsed <= 0 || instructionsExecuted <= 0) {
    return; // Skip update - this hides the real issue!
}
if (!isFinite(instantMips)) {
    this.mipsValue = 0; // Masks the root cause
    return;
}
```

**Good** (diagnostic logging to understand the problem):
```javascript
// Debug MIPS calculation when NaN occurs
if (isNaN(this.mipsValue) || isNaN(instantMips)) {
    console.log(`MIPS Debug: timeElapsed=${timeElapsed}, instructionsExecuted=${instructionsExecuted}, instantMips=${instantMips}, k=${k}, currentMipsValue=${this.mipsValue}`);
}
```

**Principle**: Add logging to understand WHY the problem occurs, then fix the root cause. Defensive code often masks symptoms instead of solving the underlying issue.
