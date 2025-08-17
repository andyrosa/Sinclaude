// Initialization script - waits for all dependencies to load then starts the app
window.addEventListener('load', () => {
    if (typeof Z80CPU === 'undefined') {
        userMessageAboutBug('Z80CPU class not found!', 'Critical dependency missing');
        return;
    }
    if (typeof Z80Assembler === 'undefined') {
        userMessageAboutBug('Z80Assembler class not found!', 'Critical dependency missing');
        return;
    }
    
    // Check for test suites (non-critical)
    if (typeof Z80AssemblerTestClass === 'undefined') {
        userMessageAboutBug('Z80AssemblerTestClass not loaded - assembler tests will be skipped', 'Non-critical dependency missing');
    }
    if (typeof Z80CPUEmulatorTestClass === 'undefined') {
        userMessageAboutBug('Z80CPUEmulatorTestClass not loaded - CPU tests will be skipped', 'Non-critical dependency missing');
    }
    
    window.sinclaude = new Simulator();
    
    // Initialize retro fonts from localStorage
    if (typeof initializeRetroFonts === 'function') {
        initializeRetroFonts();
    }

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
