// Constants
const LOCALSTORAGE_RETRO_FONTS_KEY = "useRetroFont";

// Menu functionality
function toggleMenu() {
  const dropdown = document.getElementById("menuDropdown");
  dropdown.style.display =
    dropdown.style.display === "block" ? "none" : "block";
}

function closeMenu() {
  document.getElementById("menuDropdown").style.display = "none";
}

function expandAssemblyTextarea() {
  if (window.sinclaude) {
    // Directly call the expansion method to avoid event conflicts
    window.sinclaude.expandElement("assemblyEditor");
  }
}

function showAbout() {
  const versionInfo = getFormattedVersionInfo();

  let aboutText =
    "Sinclaude\n\nA vanilla HTML/CSS/JavaScript Sinclair ZX81/Spectrum/Z80 emulator that runs entirely in the browser, co-written with Claude";

  if (versionInfo) {
    aboutText += `\n\nBuild Date: ${versionInfo.localBuildDate}\nCommit: ${versionInfo.shortCommit}`;
  }

  alert(aboutText);
  // Close menu after showing about
  closeMenu();
}

function updateRetroFontsToggle() {
  const retroFontsToggleEl = document.getElementById("retroFontsToggle");
  retroFontsToggleEl.textContent =
    (window.sinclaude.useSinclairFont ? "✓ " : "  ") + "Retro Fonts";
}

function toggleRetroFontsFromMenu() {
  window.sinclaude.useSinclairFont = !window.sinclaude.useSinclairFont;
  localStorage.setItem(
    LOCALSTORAGE_RETRO_FONTS_KEY,
    window.sinclaude.useSinclairFont.toString()
  );
  updateRetroFontsToggle();
  window.sinclaude.invalidateScreenCache();
  closeMenu();
}

function initializeRetroFonts() {
  if (window.sinclaude) {
    window.sinclaude.useSinclairFont =
      localStorage.getItem(LOCALSTORAGE_RETRO_FONTS_KEY) !== "false";
    updateRetroFontsToggle();
  }
}

function getFormattedVersionInfo() {
  if (typeof BUILD_VERSION_BY_YAML === "undefined") {
    return null;
  }

  const versionData = BUILD_VERSION_BY_YAML();

  // Convert buildDate to local time with error handling
  let buildDateLocal = "Unknown";
  if (versionData.buildDate) {
    const buildDate = new Date(versionData.buildDate);
    if (!isNaN(buildDate.getTime())) {
      buildDateLocal = buildDate.toLocaleString();
    }
  }

  return {
    localBuildDate: buildDateLocal,
    shortCommit: versionData.shortCommit || "Unknown",
  };
}

// DOM-dependent setup waits for DOM ready
document.addEventListener("DOMContentLoaded", function () {
  document.addEventListener("pointerdown", function (event) {
    const headerMenu = document.querySelector(".header-items");
    if (headerMenu && !headerMenu.contains(event.target)) {
      closeMenu();
    }
  });
});
