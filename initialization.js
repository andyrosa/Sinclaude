// Initialization script - waits for all dependencies to load then starts the app
window.addEventListener('load', () => {
    // A script that failed to load was already reported by boot.js
    window.sinclaude = new Simulator();

    // Show the persisted retro font choice in the menu
    updateRetroFontsToggle();

    // Load assembly: from URL if present, otherwise default
    const loadedFromURL = window.sinclaude.loadFromURL();
    if (!loadedFromURL) {
        window.sinclaude.loadDefaultAssembly();
    }

    window.sinclaude.setupAssemblyContentObserver();

    // A named game link launches directly.
    const urlParams = new URLSearchParams(window.location.search);
    if (loadedFromURL && urlParams.get('run') === 'claudasaur') {
        window.sinclaude.assembleAndRun();
    }
});
