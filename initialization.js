// Initialization script - waits for all dependencies to load then starts the app
window.addEventListener('load', () => {
    // A script that failed to load was already reported by boot.js
    window.sinclaude = new Simulator(SIMULATOR_SAMPLES);

    // Show the persisted retro font choice in the menu
    updateRetroFontsToggle();

    // Load assembly: from URL if present, otherwise default
    const loadedFromURL = window.sinclaude.loadFromURL();
    if (!loadedFromURL) {
        window.sinclaude.loadDefaultAssembly();
    }

    window.sinclaude.setupAssemblyContentObserver();

    // Shared programs use the audio gate so their opening sounds are preserved.
    if (loadedFromURL) {
        window.sinclaude.autostart();
    }
});
