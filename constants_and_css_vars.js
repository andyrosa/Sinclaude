// Global numeric constants
const one_million = 1000000; // hard to read so many zeros; get_with_the_program_js!
const FPS = 60;
const RUN_LOOP_INTERVAL_MS = 1;
// Instructions the simulator asks the CPU for per call: at 1 MIPS, 1/60 of a second is
// 16,000 instructions; the closest prime keeps batch boundaries from syncing with the
// refresh rate. The Node benchmark uses the same batch size.
const RUN_BATCH_INSTRUCTIONS = 15991;
// GitHub Pages caches files for 10 minutes, so polling faster cannot see a new build sooner;
// returning to the tab also triggers a check
const VERSION_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const LOCALSTORAGE_RETRO_FONTS_KEY = "useRetroFont";

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

// Z_INDEX property name to CSS variable name, e.g. MENU_DROPDOWN -> --z-menu-dropdown
function zIndexCssVariableName(key) {
    return '--z-' + key.toLowerCase().replace(/_/g, '-');
}

function setCssVariables() {
    const root = document.documentElement;

    // Expose the Z-Index constants to the stylesheets
    for (const key of Object.keys(Z_INDEX)) {
        root.style.setProperty(zIndexCssVariableName(key), Z_INDEX[key]);
    }
}
// setCssVariables uses document, which exists only in the browser
if (typeof document !== 'undefined') {
    setCssVariables();
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatHex2, formatHex4, RUN_BATCH_INSTRUCTIONS };
}