import { useState, useEffect } from "react";
import { X, Smartphone, Download } from "lucide-react";
import { PremiumButton } from "@/shared/components/ui/PremiumButton";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// Module-level prompt capture and reactive listeners
let globalDeferredPrompt: BeforeInstallPromptEvent | null =
  (typeof window !== "undefined" && (window as any).__pwaInstallPrompt) || null;
const promptListeners = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  const handlePrompt = (e: Event) => {
    e.preventDefault();
    const promptEvent = ((e as CustomEvent).detail || e) as BeforeInstallPromptEvent;
    globalDeferredPrompt = promptEvent;
    promptListeners.forEach((fn) => fn(globalDeferredPrompt));
  };

  window.addEventListener("beforeinstallprompt", handlePrompt);
  window.addEventListener("pwa-prompt-available", handlePrompt);

  window.addEventListener("appinstalled", () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((fn) => fn(null));
    try {
      localStorage.setItem("pwa-installed", "true");
    } catch {
      // Ignore localStorage errors
    }
  });
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    globalDeferredPrompt,
  );

  useEffect(() => {
    // 1. Check if already marked as installed
    try {
      if (localStorage.getItem("pwa-installed") === "true") {
        return;
      }
    } catch {
      // Ignore localStorage errors
    }

    // 2. Check if running in standalone mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // 3. Detect iOS
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // 4. Check if dismissed recently (< 7 days)
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem("pwa-install-dismissed");
    } catch {
      // Ignore localStorage errors
    }

    if (dismissed) {
      const dismissTime = parseInt(dismissed, 10);
      const daysSinceDismiss =
        (Date.now() - dismissTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 7) {
        return;
      }
    }

    // 5. Timer to show prompt
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    // 6. Listen to future beforeinstallprompt or appinstalled events
    const handlePromptChange = (evt: BeforeInstallPromptEvent | null) => {
      setPromptEvent(evt);
      if (!evt) {
        setShowPrompt(false);
      }
    };
    promptListeners.add(handlePromptChange);

    // 7. Listen for standalone media changes
    const mql = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setShowPrompt(false);
      }
    };
    if (mql && typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleMediaChange);
    }

    return () => {
      clearTimeout(timer);
      promptListeners.delete(handlePromptChange);
      if (mql && typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handleMediaChange);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setShowPrompt(false);
        try {
          localStorage.setItem("pwa-installed", "true");
        } catch {
          // Ignore localStorage errors
        }
      }
      globalDeferredPrompt = null;
      setPromptEvent(null);
    } else {
      // iOS or browsers where beforeinstallprompt was not dispatched
      setShowInstructions(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    } catch {
      // Ignore localStorage errors
    }
  };

  if (!showPrompt) return null;

  return (
    <aside
      aria-label="App Installation Prompt"
      className="fixed bottom-[calc(60px+env(safe-area-inset-bottom,0px)+12px)] left-3 right-3 z-40 animate-in slide-in-from-bottom duration-500 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96"
    >
      <div className="bg-background rounded-2xl shadow-2xl border border-primary/20 p-4 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-primary transition-colors"
          aria-label="Close install prompt"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-primary/5 p-3 rounded-xl shrink-0">
            <Smartphone className="w-8 h-8 text-gold" />
          </div>

          <div className="flex-1">
            <h3 className="font-display font-bold text-lg text-primary">
              Get the App
            </h3>
            <p className="text-sm font-sans text-text-muted mt-1 leading-relaxed">
              Install the Mysuru Paakashale app for a better experience and
              quick access to your meals.
            </p>

            <div className="mt-4">
              {showInstructions ? (
                isIOS ? (
                  <div className="bg-primary/5 rounded-lg p-3 text-xs font-sans text-primary animate-in fade-in slide-in-from-top-2">
                    <span className="block font-bold mb-1">
                      iOS Install Instructions:
                    </span>
                    Tap the{" "}
                    <span className="inline-block px-1 bg-white rounded border shadow-sm">
                      Share
                    </span>{" "}
                    icon at the bottom of Safari, then tap{" "}
                    <strong>Add to Home Screen</strong>.
                  </div>
                ) : (
                  <div className="bg-primary/5 rounded-lg p-3 text-xs font-sans text-primary animate-in fade-in slide-in-from-top-2">
                    <span className="block font-bold mb-1">
                      How to Install:
                    </span>
                    Tap your browser menu (
                    <span className="font-mono font-bold">⋮</span> or{" "}
                    <span className="font-mono font-bold">⋯</span>) in the top
                    bar, then select <strong>Install app</strong> or{" "}
                    <strong>Add to Home screen</strong>.
                  </div>
                )
              ) : (
                <PremiumButton
                  onClick={() => void handleInstallClick()}
                  className="w-full min-h-[44px] font-bold"
                >
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
