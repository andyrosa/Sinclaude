// Clipboard functionality

// Copy magazine listing content to clipboard
function copyMagazineListingToClipboard() {
    const content = document.getElementById('machineCode').textContent;

    if (content.trim() === '') {
        userMessage('Magazine listing is empty - nothing to copy');
        return;
    }

    // navigator.clipboard exists only in secure contexts (https/localhost)
    if (!navigator.clipboard) {
        copyViaExecCommand(content);
        return;
    }

    navigator.clipboard.writeText(content).then(() => {
        userMessage('Magazine listing copied to clipboard');
    }).catch(err => {
        // Fallback for older browsers
        copyViaExecCommand(content);
    });
}

// Legacy copy path for insecure contexts and older browsers
function copyViaExecCommand(content) {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    document.body.appendChild(textArea);
    textArea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (succeeded) {
        userMessage('Magazine listing copied to clipboard');
    } else {
        userMessage('Copy to clipboard failed - select the listing text and copy manually');
    }
}
