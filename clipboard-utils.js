// Clipboard functionality

// Copy magazine listing content to clipboard
function copyMagazineListingToClipboard() {
    const content = document.getElementById('machineCode').textContent;
    
    if (content.trim() === '') {
        userMessage('Magazine listing is empty - nothing to copy');
        return;
    }
    
    navigator.clipboard.writeText(content).then(() => {
        userMessage('Magazine listing copied to clipboard');
    }).catch(err => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        userMessage('Magazine listing copied to clipboard');
    });
}
