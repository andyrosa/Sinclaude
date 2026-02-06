// Global numeric constants
const one_million = 1000000; // hard to read so many zeros; get_with_the_program_js!
const FPS = 60;
const RUN_LOOP_INTERVAL_MS = 1;
const fancy_highlight_scroll = true;
const version_update_check_interval_ms = 5000;

// Hex formatting helpers
const formatHex2 = (value) => value.toString(16).padStart(2, "0").toUpperCase();
const formatHex4 = (value) => value.toString(16).padStart(4, "0").toUpperCase();

// Responsive breakpoints
const BREAKPOINTS = {
    MOBILE_MAX: 768    // Maximum width for mobile/phone devices
};

// State constants
const STATE = {
    NOT_READY: 'state_not_ready',
    FREE_RUNNING: 'state_free_running',
    STEPPING: 'state_stepping'
};

// Z-Index layering constants to avoid conflicts
const Z_INDEX = {
    BASE: 1,                    // Base layer for normal elements
    MENU_DROPDOWN: 100,         // Menu dropdown
    MODAL_BACKDROP: 900,        // Modal backdrops
    EXPANDED_ELEMENT: 1000,     // Expanded textarea/elements
    RESTORE_MESSAGE: 1001,      // Restore message overlay
    TOOLTIP: 1100,              // Tooltips
    NOTIFICATION: 1200,         // Notifications
    DEBUG_OVERLAY: 9000,        // Debug overlays
    MAXIMUM: 9999               // Maximum z-index for critical overlays
};

// Maps Z_INDEX property names to CSS variable names
// e.g. MENU_DROPDOWN -> --z-menu-dropdown
const Z_INDEX_CSS_NAMES = {
    BASE: '--z-base',
    MENU_DROPDOWN: '--z-menu-dropdown',
    MODAL_BACKDROP: '--z-modal-backdrop',
    EXPANDED_ELEMENT: '--z-expanded-element',
    RESTORE_MESSAGE: '--z-restore-message',
    TOOLTIP: '--z-tooltip',
    NOTIFICATION: '--z-notification',
    DEBUG_OVERLAY: '--z-debug-overlay',
    MAXIMUM: '--z-maximum',
};

function setCssVariables() {
    const root = document.documentElement;

    // Set Z-Index constants
    for (const key of Object.keys(Z_INDEX_CSS_NAMES)) {
        root.style.setProperty(Z_INDEX_CSS_NAMES[key], Z_INDEX[key]);
    }

    // Set breakpoint constants
    root.style.setProperty('--narrow-max-width', BREAKPOINTS.MOBILE_MAX + 'px');
}
setCssVariables();