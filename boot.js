// Load version.js with fallback strategy: local first, then GitHub, then error
function loadVersionWithCallback(callback) {
  // Remove any existing version.js script tags to prevent accumulation
  document.querySelectorAll('script[src*="version.js"]').forEach(function(script) {
    script.remove();
  });

  function loadVersionGitHubIO() {
    const githubVersionScript = document.createElement("script");
    githubVersionScript.src =
      "https://andyrosa.github.io/Sinclaude/version.js?cb=" + Date.now();
    githubVersionScript.onload = callback;
    githubVersionScript.onerror = function () {
      userMessageAboutBug(
        "Unable to load version information from local and remote sources",
        `version.js failed to load from ${githubVersionScript.src}`
      );
      callback();
    };
    document.head.appendChild(githubVersionScript);
  }

  // First try to load from local folder
  const localVersionScript = document.createElement("script");
  localVersionScript.src = "version.js?cb=" + Date.now();
  localVersionScript.onload = callback;
  localVersionScript.onerror = function () {
    localVersionScript.remove();
    loadVersionGitHubIO();
  };
  document.head.appendChild(localVersionScript);
}

// Initial version load that starts the application
loadVersionWithCallback(loadScripts);

function loadScripts() {
  const cacheBust =
    typeof BUILD_VERSION_BY_YAML !== "undefined"
      ? BUILD_VERSION_BY_YAML().buildDate
      : Date.now();
  // console-utils.js, constants_and_css_vars.js and ui.js are static tags in simulator.html
  const scripts = [
    "clipboard-utils.js",
    "scroll_target.js",
    "version_update.js",
    "tester.js",
    "z80_assembler.js",
    "z80_assembler_test.js",
    "z80_cpu_emulator.js",
    "z80_cpu_emulator_test_cases.js",
    "z80_cpu_emulator_test_runner.js",
    "default_asm.js",
    "basics_asm.js",
    "space_invader_asm.js",
    "claudasaur_asm.js",
    "simulator.js",
    "initialization.js",
  ];

  // All tags are inserted at once so the browser downloads them in parallel;
  // async=false keeps execution in list order, which the modules depend on.
  // A failed script is reported here, once; the later scripts still run and
  // any missing dependency surfaces as a ReferenceError at its first use.
  scripts.forEach(function (src) {
    const script = document.createElement("script");
    script.src = src + "?cb=" + cacheBust;
    script.async = false;
    script.onerror = function () {
      userMessageAboutBug(
        `Failed to load script: ${src}`,
        `Script loading error for ${script.src}`
      );
    };
    document.body.appendChild(script);
  });
}
