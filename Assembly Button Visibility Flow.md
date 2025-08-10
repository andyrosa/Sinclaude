# Assembly Button Visibility Flow

## Overview
The system uses CSS classes applied to the `.assembly-section` element to control which buttons are visible. The core logic is centralized in the `updateButtonVisibility()` method and triggered by a MutationObserver that watches for text changes.

Button visibility management only applies to **narrow viewports** (≤768px width, typically mobile devices). On full-width viewports, all buttons remain visible at all times.

## Viewport-Specific Behavior

### Full Viewport (Desktop)
- **Width**: > 768px
- **Button Behavior**: All assembly buttons are always visible
- **Observer**: MutationObserver is not initialized
- **CSS Classes**: No state classes are applied

### Narrow Viewport (Mobile)
- **Width**: ≤ 768px
- **Button Behavior**: Dynamic visibility based on content state
- **Observer**: MutationObserver watches assembly text changes
- **CSS Classes**: State classes control button visibility

## Two Main States (Narrow Viewport Only)

### 1. Empty State
- **Trigger**: Assembly text area is empty or contains only whitespace
- **CSS Class**: `.assembly-empty-state`
- **Visible Buttons**: Only the 3 load buttons (Load Default, Load Basics, Load Space Invader)
- **Hidden Buttons**: Clear and Assemble and Run
- **Purpose**: Guide users to load example code when starting fresh

### 2. Content State
- **Trigger**: Assembly text area contains non-whitespace content
- **CSS Class**: `.assembly-content-state`
- **Visible Buttons**: Clear and Assemble and Run
- **Hidden Buttons**: All 3 load buttons
- **Purpose**: Focus on editing and running the current code

## Implementation Details

### Key Methods
- `updateButtonVisibility()`: Core logic for state management
- `setupAssemblyContentObserver()`: Initializes the MutationObserver
- `isNarrowViewport()`: Determines if dynamic button behavior should apply

### CSS Classes
- `.assembly-empty-state`: Shows load buttons, hides action buttons
- `.assembly-content-state`: Shows action buttons, hides load buttons
- `body.stepping`: Globally hides load buttons during debug sessions

### Observer Configuration
- **Target**: `.assembly-column` element
- **Options**: `{ childList: true, subtree: true, characterData: true }`
- **Trigger**: Text content changes in the assembly editor