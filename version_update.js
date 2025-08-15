// Version checking system - manages automatic version checking and update dialogs

window.versionChecker = {
  currentVersionTimestamp: null,
  versionCheckInterval: null,
  
  // Initialize version checking system
  init: function(timerManager) {
    this.timerManager = timerManager;

    // Start version checking 
    this.versionCheckInterval = this.timerManager.createTimer(
      () => this.checkForVersionChange(),
      version_update_check_interval_ms,
      true
    );
  },

  // Check for version change and show dialog if update available
  checkForVersionChange: function() {
    // Get current version timestamp
    if (typeof BUILD_VERSION_BY_YAML !== "undefined") {
      this.currentVersionTimestamp = BUILD_VERSION_BY_YAML().buildDate;
    }
    
    // Only check if we have current version timestamp
    if (!this.currentVersionTimestamp) {
      return;
    }

    this.checkForVersionUpdate((newVersion, error) => {
      if (error) {
        // Silently handle errors to avoid disrupting user experience
        console.error('Version check failed:', error);
        return;
      }
      
      if (newVersion) {
        this.showUpdateDialog(newVersion);
      }
    });
  },

  showUpdateDialog: function(newVersion) {
    // Stop further version checks until user responds
    if (this.versionCheckInterval && this.timerManager) {
      this.timerManager.clearTimer(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }

    // Create dialog overlay
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'update-dialog-overlay';
    
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

    // Handle button clicks
    const updateBtn = dialog.querySelector('#updateBtn');
    const cancelBtn = dialog.querySelector('#cancelBtn');

    updateBtn.addEventListener('click', () => {
      // Refresh the page to get the new version
      window.location.reload(true);
    });

    cancelBtn.addEventListener('click', () => {
      // Remove dialog and resume version checking
      document.body.removeChild(dialogOverlay);
      this.resumeVersionChecking();
    });

    // Close dialog when clicking overlay
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        document.body.removeChild(dialogOverlay);
        this.resumeVersionChecking();
      }
    });
  },

  // Resume version checking after dialog cancellation
  resumeVersionChecking: function() {
    // Simply restart the regular version checking interval
    if (!this.versionCheckInterval && this.timerManager) {
      this.versionCheckInterval = this.timerManager.createTimer(
        () => this.checkForVersionChange(),
        version_update_check_interval_ms,
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

  // Check for version update 
  checkForVersionUpdate: function(callback) {
    loadVersionWithCallback(function() {
      var newVersion = typeof BUILD_VERSION_BY_YAML !== "undefined" ? BUILD_VERSION_BY_YAML().buildDate : null;
      
      if (newVersion && newVersion !== window.versionChecker.currentVersionTimestamp) {
        if (callback) callback(BUILD_VERSION_BY_YAML(), null);
      } else {
        if (callback) callback(null, null); // No version change detected
      }
    });
  }
};
