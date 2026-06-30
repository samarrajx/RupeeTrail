// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[PWA] Service Worker registered!', reg))
            .catch(err => console.error('[PWA] Service Worker registration failed', err));
    });

    /*
     * controllerchange fires when a new SW takes control of this page.
     * skipWaiting() + clients.claim() (in sw.js) make the new worker the
     * active controller, but the *already-open page* keeps running the old
     * cached resources until it is reloaded. Without this listener an
     * installed PWA that was open in the background would never pick up
     * the fixed CSS — the user would have to force-quit and relaunch.
     *
     * We reload only when the controller actually changes (not on first
     * registration), so this does not cause a reload loop.
     */
    let swFirstInstall = !navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swFirstInstall) {
            // Controller changed because SW just claimed a fresh install —
            // no reload needed; the page was already loaded with live network.
            swFirstInstall = false;
            return;
        }
        console.log('[PWA] New service worker took control — reloading to apply updated assets.');
        window.location.reload();
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
