// Version checking system - manages automatic version checking and update dialogs

window.versionChecker = {
  currentVersionTimestamp: null,
  versionCheckInterval: null,
  updateDialogOverlay: null, // set while the update dialog is open

  // Initialize version checking system
  init: function(timerManager) {
    this.timerManager = timerManager;
    this.resumeVersionChecking();

    // A user coming back to the tab is the moment a new build matters most
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.checkForVersionChange();
      }
    });
  },

  // Check for version change and show dialog if update available
  checkForVersionChange: function() {
    // One dialog at a time; the timer is stopped while it is open but visibilitychange is not
    if (this.updateDialogOverlay) {
      return;
    }

    // Get current version timestamp
    if (typeof BUILD_VERSION_BY_YAML !== "undefined") {
      this.currentVersionTimestamp = BUILD_VERSION_BY_YAML().buildDate;
    }

    // Only check if we have current version timestamp
    if (!this.currentVersionTimestamp) {
      return;
    }

    this.checkForVersionUpdate((newVersion) => {
      if (newVersion) {
        this.showUpdateDialog(newVersion);
      }
    });
  },

  showUpdateDialog: function(newVersion) {
    // Stop further version checks until user responds
    this.cleanup();

    // Create dialog overlay
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'update-dialog-overlay';
    this.updateDialogOverlay = dialogOverlay;
    
    // Create dialog box using section styling
    const dialog = document.createElement('div');
    dialog.className = 'update-dialog section';

    // Create dialog content
    dialog.innerHTML = `
      <h3>Version Change Detected</h3>
      <div class="section-content">
        <div class="section-main">
          <p>A different version of Sinclaude is available.</p>
          <small>${new Date(newVersion.buildDate).toLocaleString()}</small>
          <div class="section-controls">
            <button id="updateBtn">Update</button>
            <button id="cancelBtn">Cancel</button>
          </div>
        </div>
      </div>
    `;

    dialogOverlay.appendChild(dialog);
    document.body.appendChild(dialogOverlay);

    const dismissDialog = () => {
      dialogOverlay.remove();
      this.updateDialogOverlay = null;
      this.resumeVersionChecking();
    };

    // Handle button clicks
    dialog.querySelector('#updateBtn').addEventListener('click', () => {
      window.location.reload(true);
    });

    dialog.querySelector('#cancelBtn').addEventListener('click', dismissDialog);

    // Close dialog when clicking overlay
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        dismissDialog();
      }
    });
  },

  // Start the periodic check; also used to resume after dialog cancellation
  resumeVersionChecking: function() {
    if (!this.versionCheckInterval && this.timerManager) {
      this.versionCheckInterval = this.timerManager.createTimer(
        () => this.checkForVersionChange(),
        VERSION_CHECK_INTERVAL_MS,
        true
      );
    }
  },

  // Cleanup method for timer management
  cleanup: function() {
    if (this.versionCheckInterval && this.timerManager) {
      this.timerManager.clearTimer(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
  },

  // Reload version.js and call back with the new build info, or null when unchanged
  checkForVersionUpdate: function(callback) {
    const savedTimestamp = this.currentVersionTimestamp;
    loadVersionWithCallback(function() {
      const newBuildDate = typeof BUILD_VERSION_BY_YAML !== "undefined" ? BUILD_VERSION_BY_YAML().buildDate : null;

      if (newBuildDate && newBuildDate !== savedTimestamp) {
        callback(BUILD_VERSION_BY_YAML());
      } else {
        callback(null);
      }
    });
  }
};
