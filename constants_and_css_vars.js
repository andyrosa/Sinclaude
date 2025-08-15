// Global numeric constants
const one_million = 1000000; // hard to read so many zeros; get_with_the_program_js!
const FPS = 60;
const RUN_LOOP_INTERVAL_MS = 1;
const fancy_highlight_scroll = true;
const version_update_check_interval_ms = 5000;

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

function setCssVariables() {
    const root = document.documentElement;
    
    // Set Z-Index constants
    root.style.setProperty('--z-base', Z_INDEX.BASE);
    root.style.setProperty('--z-menu-dropdown', Z_INDEX.MENU_DROPDOWN);
    root.style.setProperty('--z-modal-backdrop', Z_INDEX.MODAL_BACKDROP);
    root.style.setProperty('--z-expanded-element', Z_INDEX.EXPANDED_ELEMENT);
    root.style.setProperty('--z-restore-message', Z_INDEX.RESTORE_MESSAGE);
    root.style.setProperty('--z-tooltip', Z_INDEX.TOOLTIP);
    root.style.setProperty('--z-notification', Z_INDEX.NOTIFICATION);
    root.style.setProperty('--z-debug-overlay', Z_INDEX.DEBUG_OVERLAY);
    root.style.setProperty('--z-maximum', Z_INDEX.MAXIMUM);
    
    // Set breakpoint constants
    root.style.setProperty('--narrow-max-width', BREAKPOINTS.MOBILE_MAX + 'px');
}
setCssVariables();