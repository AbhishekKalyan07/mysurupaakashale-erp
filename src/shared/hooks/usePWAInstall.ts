import { useState, useEffect, useCallback } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let globalInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

let globalIsModalOpen = false;
const modalListeners = new Set<(open: boolean) => void>();

export function openGetAppModal() {
  globalIsModalOpen = true;
  modalListeners.forEach((fn) => fn(true));
}

export function closeGetAppModal() {
  globalIsModalOpen = false;
  modalListeners.forEach((fn) => fn(false));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalInstallPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });

  window.addEventListener("appinstalled", () => {
    globalInstallPrompt = null;
    try {
      localStorage.setItem("pwa-installed", "true");
    } catch {
      // Ignore localStorage errors
    }
    installListeners.forEach((fn) => fn());
  });
}

export function usePWAInstall() {
  const [, setTick] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(globalIsModalOpen);

  useEffect(() => {
    const handleInstallChange = () => setTick((t) => t + 1);
    const handleModalChange = (open: boolean) => setIsModalOpen(open);

    installListeners.add(handleInstallChange);
    modalListeners.add(handleModalChange);

    return () => {
      installListeners.delete(handleInstallChange);
      modalListeners.delete(handleModalChange);
    };
  }, []);

  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );

  let isInstalledMarked = false;
  try {
    isInstalledMarked = typeof window !== "undefined" && localStorage.getItem("pwa-installed") === "true";
  } catch {
    // Ignore localStorage errors
  }

  const isInstalled = isStandalone || isInstalledMarked;

  const isIOS = typeof window !== "undefined" && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  );

  const isAndroid = typeof window !== "undefined" && /Android/i.test(navigator.userAgent);

  const canPromptDirectly = Boolean(globalInstallPrompt);

  const triggerInstall = useCallback(async () => {
    if (globalInstallPrompt) {
      try {
        await globalInstallPrompt.prompt();
        const { outcome } = await globalInstallPrompt.userChoice;
        if (outcome === "accepted") {
          try {
            localStorage.setItem("pwa-installed", "true");
          } catch {
            // Ignore storage errors
          }
          globalInstallPrompt = null;
          installListeners.forEach((fn) => fn());
          closeGetAppModal();
          return "accepted";
        }
        return "dismissed";
      } catch (err) {
        console.warn("[usePWAInstall] prompt failed:", err);
        openGetAppModal();
        return "instructions_opened";
      }
    } else {
      openGetAppModal();
      return "instructions_opened";
    }
  }, []);

  return {
    isInstalled,
    isStandalone,
    isIOS,
    isAndroid,
    canPromptDirectly,
    isModalOpen,
    openModal: openGetAppModal,
    closeModal: closeGetAppModal,
    triggerInstall,
  };
}
