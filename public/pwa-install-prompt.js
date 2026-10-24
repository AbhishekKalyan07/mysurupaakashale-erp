/**
 * Early PWA Install Prompt Capture.
 *
 * Captures `beforeinstallprompt` before the main application bundle loads,
 * stores the event on `window.__pwaInstallPrompt`, and dispatches
 * `pwa-prompt-available` so UI components (usePWAInstall, PWAInstallPrompt)
 * can present install options without missing early browser events.
 *
 * Kept in an external same-origin file to strictly comply with Content Security Policy (CSP)
 * script-src 'self' without requiring 'unsafe-inline'.
 */
(function () {
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__pwaInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-prompt-available', { detail: e }));
    });
    window.addEventListener('appinstalled', function () {
      window.__pwaInstallPrompt = null;
      try {
        localStorage.setItem('pwa-installed', 'true');
      } catch {}
    });
  }
})();
