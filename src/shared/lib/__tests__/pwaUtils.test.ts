import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isLegacyServiceWorkerUrl,
  isLegacyServiceWorkerRegistration,
  cleanupLegacyServiceWorkers,
  handleChunkPreloadError,
  type ServiceWorkerRegistrationLike,
} from "../pwaUtils";

describe("PWA Utilities & Service Worker Lifecycle Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Legacy Service Worker URL Identification", () => {
    it("flags obsolete service worker URLs matching /service-worker.js", () => {
      expect(isLegacyServiceWorkerUrl("/service-worker.js")).toBe(true);
      expect(isLegacyServiceWorkerUrl("service-worker.js")).toBe(true);
      expect(isLegacyServiceWorkerUrl("https://mysuru-paakashale-erp.web.app/service-worker.js")).toBe(true);
      expect(isLegacyServiceWorkerUrl("http://localhost:5000/service-worker.js")).toBe(true);
    });

    it("strictly preserves and protects the active /sw.js worker", () => {
      expect(isLegacyServiceWorkerUrl("/sw.js")).toBe(false);
      expect(isLegacyServiceWorkerUrl("sw.js")).toBe(false);
      expect(isLegacyServiceWorkerUrl("https://mysuru-paakashale-erp.web.app/sw.js")).toBe(false);
      expect(isLegacyServiceWorkerUrl("http://localhost:5000/sw.js")).toBe(false);
    });

    it("handles empty or irrelevant script URLs safely", () => {
      expect(isLegacyServiceWorkerUrl("")).toBe(false);
      expect(isLegacyServiceWorkerUrl("/firebase-messaging-sw.js")).toBe(false);
      expect(isLegacyServiceWorkerUrl("/assets/index.js")).toBe(false);
    });
  });

  describe("2. Legacy Service Worker Registration Inspection", () => {
    it("flags registrations where active worker is /service-worker.js", () => {
      const reg: ServiceWorkerRegistrationLike = {
        active: { scriptURL: "https://example.com/service-worker.js" },
        waiting: null,
        installing: null,
        unregister: vi.fn(),
      };
      expect(isLegacyServiceWorkerRegistration(reg)).toBe(true);
    });

    it("flags registrations where waiting or installing worker is /service-worker.js", () => {
      const regWaiting: ServiceWorkerRegistrationLike = {
        active: null,
        waiting: { scriptURL: "https://example.com/service-worker.js" },
        installing: null,
        unregister: vi.fn(),
      };
      expect(isLegacyServiceWorkerRegistration(regWaiting)).toBe(true);

      const regInstalling: ServiceWorkerRegistrationLike = {
        active: null,
        waiting: null,
        installing: { scriptURL: "https://example.com/service-worker.js" },
        unregister: vi.fn(),
      };
      expect(isLegacyServiceWorkerRegistration(regInstalling)).toBe(true);
    });

    it("does not flag registrations for active /sw.js", () => {
      const activeReg: ServiceWorkerRegistrationLike = {
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: null,
        installing: null,
        unregister: vi.fn(),
      };
      expect(isLegacyServiceWorkerRegistration(activeReg)).toBe(false);
    });
  });

  describe("3. Targeted & Idempotent Cleanup of Legacy Service Workers", () => {
    it("unregisters only obsolete workers and preserves active /sw.js worker", async () => {
      const legacyUnregister = vi.fn().mockResolvedValue(true);
      const activeUnregister = vi.fn().mockResolvedValue(true);

      const registrations: ServiceWorkerRegistrationLike[] = [
        {
          active: { scriptURL: "https://example.com/service-worker.js" },
          unregister: legacyUnregister,
        },
        {
          active: { scriptURL: "https://example.com/sw.js" },
          unregister: activeUnregister,
        },
      ];

      const getRegs = vi.fn().mockResolvedValue(registrations);
      const cleaned = await cleanupLegacyServiceWorkers(getRegs);

      expect(cleaned).toEqual(["https://example.com/service-worker.js"]);
      expect(legacyUnregister).toHaveBeenCalledTimes(1);
      expect(activeUnregister).not.toHaveBeenCalled();
    });

    it("is completely idempotent when no legacy worker exists", async () => {
      const activeUnregister = vi.fn().mockResolvedValue(true);
      const registrations: ServiceWorkerRegistrationLike[] = [
        {
          active: { scriptURL: "https://example.com/sw.js" },
          unregister: activeUnregister,
        },
      ];

      const getRegs = vi.fn().mockResolvedValue(registrations);
      const cleaned = await cleanupLegacyServiceWorkers(getRegs);

      expect(cleaned).toEqual([]);
      expect(activeUnregister).not.toHaveBeenCalled();
    });

    it("handles unregister errors gracefully without throwing", async () => {
      const faultyUnregister = vi.fn().mockRejectedValue(new Error("DOMException: SecurityError"));
      const registrations: ServiceWorkerRegistrationLike[] = [
        {
          active: { scriptURL: "https://example.com/service-worker.js" },
          unregister: faultyUnregister,
        },
      ];

      const getRegs = vi.fn().mockResolvedValue(registrations);
      const cleaned = await cleanupLegacyServiceWorkers(getRegs);

      expect(cleaned).toEqual([]);
      expect(faultyUnregister).toHaveBeenCalled();
    });
  });

  describe("4. Stale JavaScript Chunk Preload Error Recovery", () => {
    it("notifies user without reloading when device is offline", async () => {
      const onToast = vi.fn();
      const onReload = vi.fn();
      const onLegacyCleanup = vi.fn();

      const result = await handleChunkPreloadError({
        isOnline: false,
        lastReloadTimestamp: null,
        onToast,
        onReload,
        onLegacyCleanup,
      });

      expect(result.action).toBe("offline-notified");
      expect(onToast).toHaveBeenCalledWith("You are offline. Connect to the internet to open this page.");
      expect(onReload).not.toHaveBeenCalled();
      expect(onLegacyCleanup).not.toHaveBeenCalled();
    });

    it("safely cleans legacy workers, updates active worker, and triggers reload when online", async () => {
      const onToast = vi.fn();
      const onReload = vi.fn();
      const onLegacyCleanup = vi.fn().mockResolvedValue(undefined);
      const onTriggerUpdate = vi.fn().mockResolvedValue(undefined);

      const now = 100000;
      const result = await handleChunkPreloadError({
        isOnline: true,
        lastReloadTimestamp: null,
        now,
        onToast,
        onReload,
        onLegacyCleanup,
        onTriggerUpdate,
      });

      expect(result.action).toBe("reload-triggered");
      expect(result.newReloadTimestamp).toBe(now);
      expect(onLegacyCleanup).toHaveBeenCalledTimes(1);
      expect(onTriggerUpdate).toHaveBeenCalledTimes(1);
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onToast).not.toHaveBeenCalled();
    });

    it("throttles reloads if a reload occurred within throttle window to prevent infinite loops", async () => {
      const onToast = vi.fn();
      const onReload = vi.fn();
      const onLegacyCleanup = vi.fn();

      const now = 100000;
      const lastReloadTimestamp = 95000; // 5s ago, within 10s throttle window

      const result = await handleChunkPreloadError({
        isOnline: true,
        lastReloadTimestamp,
        now,
        throttleMs: 10000,
        onToast,
        onReload,
        onLegacyCleanup,
      });

      expect(result.action).toBe("reload-throttled");
      expect(result.newReloadTimestamp).toBe(lastReloadTimestamp);
      expect(onToast).toHaveBeenCalledWith("A new update is available. Please refresh the page.");
      expect(onReload).not.toHaveBeenCalled();
      expect(onLegacyCleanup).not.toHaveBeenCalled();
    });

    it("permits reload once throttle window has elapsed", async () => {
      const onToast = vi.fn();
      const onReload = vi.fn();
      const onLegacyCleanup = vi.fn().mockResolvedValue(undefined);

      const now = 100000;
      const lastReloadTimestamp = 85000; // 15s ago, past 10s throttle window

      const result = await handleChunkPreloadError({
        isOnline: true,
        lastReloadTimestamp,
        now,
        throttleMs: 10000,
        onToast,
        onReload,
        onLegacyCleanup,
      });

      expect(result.action).toBe("reload-triggered");
      expect(result.newReloadTimestamp).toBe(now);
      expect(onReload).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. Content Security Policy & Cross-Origin Font Invariants", () => {
    it("confirms active Service Worker source (sw.ts) does not intercept cross-origin fonts", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const swContent = fs.readFileSync(path.resolve(process.cwd(), "src/sw.ts"), "utf-8");

      // Verify that runtime route strictly enforces same-origin
      expect(swContent).toContain("url.origin === self.location.origin");

      // Verify that cross-origin requests are deliberately not registered with Workbox
      expect(swContent).toContain(
        "// Cross-origin requests (Google Fonts, reCAPTCHA, Google APIs, Analytics, etc.)"
      );
      expect(swContent).toContain(
        "// are NOT registered with any Workbox route."
      );
    });

    it("confirms firebase.json maintains strict CSP with fonts permitted under font-src", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const fbConfig = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "firebase.json"), "utf-8")
      );

      const headers = fbConfig.hosting.headers;
      const allHeaders = headers.flatMap((h: { headers: Array<{ key: string; value: string }> }) => h.headers);
      const cspHeader = allHeaders.find((h: { key: string }) => h.key === "Content-Security-Policy");

      expect(cspHeader).toBeDefined();
      const cspValue = cspHeader.value;

      // font-src must include https://fonts.gstatic.com for CSS font downloads
      expect(cspValue).toContain("font-src 'self' https://fonts.gstatic.com;");

      // style-src must include https://fonts.googleapis.com
      expect(cspValue).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;");

      // connect-src must remain restricted to necessary API endpoints and not unnecessarily bloated
      expect(cspValue).toContain("connect-src 'self' https://*.googleapis.com");
    });
  });
});
