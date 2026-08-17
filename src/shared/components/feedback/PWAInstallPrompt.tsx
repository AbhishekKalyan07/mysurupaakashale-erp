import { useState, useEffect } from 'react';
import { X, Smartphone, Download } from 'lucide-react';
import { PremiumButton } from '@/shared/components/ui/PremiumButton';

// Global variable to catch the install prompt event
let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
});

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  
  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
                         
    if (isStandalone) {
      return;
    }

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Check if dismissed recently
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissTime = parseInt(dismissed, 10);
      const daysSinceDismiss = (Date.now() - dismissTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 7) {
        return;
      }
    }

    // Logic to show prompt:
    // If we have deferredPrompt (Android/Desktop), or it's iOS (which doesn't have deferredPrompt)
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      deferredPrompt = null;
    } else if (isIOS) {
      // iOS doesn't support programmatic install, just show the instructions
      alert('To install on iOS: tap the Share button at the bottom of Safari, then tap "Add to Home Screen".');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <aside aria-label="App Installation Prompt" className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom duration-500 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
      <div className="bg-background rounded-2xl shadow-2xl border border-primary/20 p-4 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-2 text-text-muted hover:text-primary transition-colors"
          aria-label="Close install prompt"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-primary/5 p-3 rounded-xl shrink-0">
            <Smartphone className="w-8 h-8 text-gold" />
          </div>
          
          <div className="flex-1">
            <h3 className="font-display font-bold text-lg text-primary">Get the App</h3>
            <p className="text-sm font-sans text-text-muted mt-1 leading-relaxed">
              Install the Mysuru Paakashale app for a better experience and quick access to your meals.
            </p>
            
            <div className="mt-4">
              {isIOS ? (
                <div className="bg-primary/5 rounded-lg p-3 text-xs font-sans text-primary">
                  <span className="block font-bold mb-1">iOS Install Instructions:</span>
                  Tap the <span className="inline-block px-1 bg-white rounded border shadow-sm">Share</span> icon at the bottom of Safari, then tap <strong>Add to Home Screen</strong>.
                </div>
              ) : (
                <PremiumButton onClick={handleInstallClick} className="w-full font-bold">
                  <Download className="w-4 h-4 mr-2" />
                  Install App
                </PremiumButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
