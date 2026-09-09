// Initialization script - waits for all dependencies to load then starts the app
window.addEventListener('load', () => {
    // A script that failed to load was already reported by boot.js
    window.sinclaude = new Simulator();

    // Show the persisted retro font choice in the menu
    updateRetroFontsToggle();

    // Load assembly: from URL if present, otherwise default
    if (!window.sinclaude.loadFromURL()) {
        window.sinclaude.loadDefaultAssembly();
    }

    window.sinclaude.setupAssemblyContentObserver();

    // Auto-assemble if assemble parameter is truthy
    const urlParams = new URLSearchParams(window.location.search);
    if (isTruthy(urlParams.get('assemble'))) {
        window.sinclaude.assembleAndRun();
    }
});
