// Load version.js with fallback strategy: local first, then GitHub, then error
(function loadVersion() {
  function loadVersionGitHubIO() {
    var githubVersionScript = document.createElement("script");
    githubVersionScript.src =
      "https://andyrosa.github.io/Sinclaude/version.js?cb=" + Date.now();
    githubVersionScript.onload = function () {
      loadScripts();
    };
    githubVersionScript.onerror = function () {
      console.error(
        "Failed to load version.js from both local and GitHub sources"
      );
      userMessageAboutBug(
        "Unable to load version information from local or remote sources",
        "Please check your internet connection or contact support."
      );
      loadScripts();
    };
    document.head.appendChild(githubVersionScript);
  }

  // First try to load from local folder
  var localVersionScript = document.createElement("script");
  localVersionScript.src = "version.js?cb=" + Date.now();
  localVersionScript.onload = function () {
    loadScripts();
  };
  localVersionScript.onerror = function () {
    // Remove the failed script element from DOM
    document.head.removeChild(localVersionScript);
    loadVersionGitHubIO();
  };
  document.head.appendChild(localVersionScript);
})();

function loadScripts() {
  var cacheBust =
    typeof BUILD_VERSION_BY_YAML !== "undefined" &&
    BUILD_VERSION_BY_YAML.buildDate
      ? BUILD_VERSION_BY_YAML.buildDate
      : Date.now();
  var scripts = [
    "console-utils.js",
    "scroll_target.js",
    "z80_assembler.js",
    "z80_cpu_emulator.js",
    "z80_assembler_test.js",
    "z80_cpu_emulator_test.js",
    "default_asm.js",
    "basics_asm.js",
    "space_invader_asm.js",
    "simulator.js",
    "initialization.js",
  ];

  var scriptIndex = 0;

  function loadNextScript() {
    if (scriptIndex >= scripts.length) {
      // All scripts loaded
      return;
    }

    var src = scripts[scriptIndex];
    var script = document.createElement("script");
    script.src = src + "?cb=" + cacheBust;
    script.onload = function () {
      scriptIndex++;
      loadNextScript();
    };
    script.onerror = function () {
      if (typeof userMessageAboutBug === "function") {
        userMessageAboutBug(
          `Failed to load script: ${src}`,
          `Script loading error for ${src}`
        );
      } else {
        console.error(`Failed to load script: ${src}`);
        alert(
          `Error: Failed to load required script ${src}. The simulator may not work correctly.`
        );
      }
      // Continue loading even if one script fails
      scriptIndex++;
      loadNextScript();
    };
    document.body.appendChild(script);
  }

  // Start loading scripts sequentially
  loadNextScript();
}
