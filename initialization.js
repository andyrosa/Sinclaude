// Initialization script - waits for all dependencies to load then starts the app
window.addEventListener('load', () => {
    if (typeof Z80CPU === 'undefined') {
        console.error('Z80CPU class not found!');
        return;
    }
    if (typeof Z80Assembler === 'undefined') {
        console.error('Z80Assembler class not found!');
        return;
    }
    window.sinclaude = new Simulator();

    // Load assembly: from URL if present, otherwise default
    if (!window.sinclaude.loadFromURL()) {
        window.sinclaude.loadDefaultAssembly();
    }

    // Auto-assemble if run parameter is truthy
    const urlParams = new URLSearchParams(window.location.search);
    if (isTruthy(urlParams.get('run'))) {
        window.sinclaude.assembleAndRun();
    }
});
