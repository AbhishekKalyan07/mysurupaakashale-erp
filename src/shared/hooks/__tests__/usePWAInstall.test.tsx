import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  usePWAInstall,
  openGetAppModal,
  closeGetAppModal,
  BeforeInstallPromptEvent,
} from "../usePWAInstall";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePWAInstall", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let hookResult: ReturnType<typeof usePWAInstall>;

  function TestHookComponent() {
    hookResult = usePWAInstall();
    return null;
  }

  const renderHook = () => {
    act(() => {
      root?.render(<TestHookComponent />);
    });
  };

  beforeEach(() => {
    localStorage.clear();
    closeGetAppModal();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // @ts-expect-error reset standalone
    delete (window.navigator as any).standalone;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
    localStorage.clear();
    closeGetAppModal();
  });

  it("returns default initial state in a standard browser", () => {
    renderHook();

    expect(hookResult.isInstalled).toBe(false);
    expect(hookResult.isStandalone).toBe(false);
    expect(hookResult.canPromptDirectly).toBe(false);
    expect(hookResult.isModalOpen).toBe(false);
  });

  it("detects standalone display mode via matchMedia", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
      })),
    });

    renderHook();

    expect(hookResult.isStandalone).toBe(true);
    expect(hookResult.isInstalled).toBe(true);
  });

  it("detects standalone mode via iOS navigator.standalone", () => {
    Object.defineProperty(window.navigator, "standalone", {
      writable: true,
      configurable: true,
      value: true,
    });

    renderHook();

    expect(hookResult.isStandalone).toBe(true);
    expect(hookResult.isInstalled).toBe(true);
  });

  it("detects installed state from localStorage flag", () => {
    localStorage.setItem("pwa-installed", "true");

    renderHook();

    expect(hookResult.isInstalled).toBe(true);
    expect(hookResult.isStandalone).toBe(false);
  });

  it("detects iOS user agent correctly", () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });

    renderHook();

    expect(hookResult.isIOS).toBe(true);
    expect(hookResult.isAndroid).toBe(false);

    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("detects Android user agent correctly", () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36",
      configurable: true,
    });

    renderHook();

    expect(hookResult.isAndroid).toBe(true);
    expect(hookResult.isIOS).toBe(false);

    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("controls modal visibility via openGetAppModal and closeGetAppModal", () => {
    renderHook();
    expect(hookResult.isModalOpen).toBe(false);

    act(() => {
      openGetAppModal();
    });
    expect(hookResult.isModalOpen).toBe(true);

    act(() => {
      closeGetAppModal();
    });
    expect(hookResult.isModalOpen).toBe(false);

    act(() => {
      hookResult.openModal();
    });
    expect(hookResult.isModalOpen).toBe(true);

    act(() => {
      hookResult.closeModal();
    });
    expect(hookResult.isModalOpen).toBe(false);
  });

  it("opens modal on triggerInstall when direct prompt is not available", async () => {
    renderHook();

    let result = "";
    await act(async () => {
      result = await hookResult.triggerInstall();
    });

    expect(result).toBe("instructions_opened");
    expect(hookResult.isModalOpen).toBe(true);
  });

  it("handles beforeinstallprompt event and triggers prompt on triggerInstall", async () => {
    renderHook();
    expect(hookResult.canPromptDirectly).toBe(false);

    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockUserChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });

    const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    event.prompt = mockPrompt;
    event.userChoice = mockUserChoice;

    act(() => {
      window.dispatchEvent(event);
    });

    expect(hookResult.canPromptDirectly).toBe(true);

    let result = "";
    await act(async () => {
      result = await hookResult.triggerInstall();
    });

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe("accepted");
    expect(localStorage.getItem("pwa-installed")).toBe("true");
    expect(hookResult.isInstalled).toBe(true);
  });

  it("handles beforeinstallprompt dismissed outcome", async () => {
    renderHook();

    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockUserChoice = Promise.resolve({ outcome: "dismissed" as const, platform: "web" });

    const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    event.prompt = mockPrompt;
    event.userChoice = mockUserChoice;

    act(() => {
      window.dispatchEvent(event);
    });

    let result = "";
    await act(async () => {
      result = await hookResult.triggerInstall();
    });

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe("dismissed");
  });

  it("falls back to instructions modal if prompt() throws", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook();

    const mockPrompt = vi.fn().mockRejectedValue(new Error("Prompt failed"));
    const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    event.prompt = mockPrompt;
    event.userChoice = Promise.resolve({ outcome: "dismissed" as const, platform: "web" });

    act(() => {
      window.dispatchEvent(event);
    });

    let result = "";
    await act(async () => {
      result = await hookResult.triggerInstall();
    });

    expect(result).toBe("instructions_opened");
    expect(hookResult.isModalOpen).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it("handles appinstalled event by updating installed state", () => {
    renderHook();
    expect(hookResult.isInstalled).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(localStorage.getItem("pwa-installed")).toBe("true");
    expect(hookResult.isInstalled).toBe(true);
  });

  it("gracefully handles localStorage throwing a SecurityError", () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;

    Storage.prototype.getItem = vi.fn(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    Storage.prototype.setItem = vi.fn(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(() => {
      renderHook();
    }).not.toThrow();

    expect(hookResult.isInstalled).toBe(false);

    // appinstalled event should also not throw
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });
    }).not.toThrow();

    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.setItem = originalSetItem;
  });
});
