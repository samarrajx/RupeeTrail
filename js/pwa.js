// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[PWA] Service Worker registered!', reg))
            .catch(err => console.error('[PWA] Service Worker registration failed', err));
    });
}

// Handle Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    console.log("[PWA] Install prompt is available.");
    
    // Dispatch custom event in case UI wants to show an install button
    const event = new CustomEvent('pwaInstallAvailable');
    window.dispatchEvent(event);
});

// Expose a global function to trigger the install prompt
window.installPWA = async function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`[PWA] User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    } else {
        console.log("[PWA] Install prompt not available or already installed.");
    }
};
