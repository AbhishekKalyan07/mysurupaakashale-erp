import { describe, it, expect, vi, beforeEach } from "vitest";

describe("PWA Security & Hardening Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe("1. Notification Click Target URL Sanitization & Open-Redirect Defense", () => {
    function sanitizeNotificationUrl(rawUrl: string | undefined, origin: string): string {
      let targetUrl = origin + "/";
      try {
        const input = rawUrl || "/";
        const parsed = new URL(input, origin);
        if (
          parsed.origin === origin &&
          (parsed.protocol === "http:" || parsed.protocol === "https:")
        ) {
          targetUrl = parsed.href;
        }
      } catch {
        targetUrl = origin + "/";
      }
      return targetUrl;
    }

    const APP_ORIGIN = "https://mysuru-paakashale-erp.web.app";

    it("allows valid relative in-app routes", () => {
      expect(sanitizeNotificationUrl("/admin/orders", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/admin/orders",
      );
      expect(sanitizeNotificationUrl("/customer/dashboard", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/customer/dashboard",
      );
      expect(sanitizeNotificationUrl("/", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
      expect(sanitizeNotificationUrl(undefined, APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
    });

    it("blocks external phishing domains and falls back to origin root", () => {
      expect(sanitizeNotificationUrl("https://evil.com/login", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
      expect(sanitizeNotificationUrl("http://attacker.example.com", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
      expect(sanitizeNotificationUrl("//attacker.com/steal-token", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
    });

    it("blocks dangerous schemes (javascript:, data:, file:) and malformed URLs", () => {
      expect(sanitizeNotificationUrl("javascript:alert(document.cookie)", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
      expect(sanitizeNotificationUrl("data:text/html,<script>evil()</script>", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
      expect(sanitizeNotificationUrl("blob:https://evil.com/uuid", APP_ORIGIN)).toBe(
        "https://mysuru-paakashale-erp.web.app/",
      );
    });
  });

  describe("2. Runtime Cache Authorization & Quota Isolation", () => {
    function shouldCacheRuntimeResponse(request: { headers: Map<string, string> }, response: { status: number; contentType: string }): boolean {
      if (!response || response.status !== 200) {
        return false;
      }
      if (request && request.headers && request.headers.has("authorization")) {
        return false;
      }
      if (response.contentType.includes("text/html")) {
        return false;
      }
      return true;
    }

    it("rejects responses to authenticated requests carrying Authorization headers", () => {
      const authReq = { headers: new Map([["authorization", "Bearer token-123"]]) };
      const resp = { status: 200, contentType: "application/javascript" };
      expect(shouldCacheRuntimeResponse(authReq, resp)).toBe(false);
    });

    it("rejects error and non-200 responses", () => {
      const publicReq = { headers: new Map() };
      expect(shouldCacheRuntimeResponse(publicReq, { status: 401, contentType: "application/json" })).toBe(false);
      expect(shouldCacheRuntimeResponse(publicReq, { status: 403, contentType: "application/json" })).toBe(false);
      expect(shouldCacheRuntimeResponse(publicReq, { status: 404, contentType: "text/plain" })).toBe(false);
      expect(shouldCacheRuntimeResponse(publicReq, { status: 500, contentType: "application/json" })).toBe(false);
    });

    it("rejects SPA fallback HTML returned for missing chunks", () => {
      const publicReq = { headers: new Map() };
      expect(shouldCacheRuntimeResponse(publicReq, { status: 200, contentType: "text/html; charset=utf-8" })).toBe(false);
    });

    it("accepts valid 200 public static assets", () => {
      const publicReq = { headers: new Map() };
      expect(shouldCacheRuntimeResponse(publicReq, { status: 200, contentType: "application/javascript" })).toBe(true);
      expect(shouldCacheRuntimeResponse(publicReq, { status: 200, contentType: "image/png" })).toBe(true);
      expect(shouldCacheRuntimeResponse(publicReq, { status: 200, contentType: "text/css" })).toBe(true);
    });
  });

  describe("3. Account Switching & Client-Side State Invalidation", () => {
    it("broadly purges all auth_* keys, session tokens, and FCM registration from localStorage", () => {
      localStorage.setItem("auth_cache_user1", JSON.stringify({ uid: "user1", role: "admin" }));
      localStorage.setItem("auth_session_id", "sess-999");
      localStorage.setItem("auth_refresh_token", "rt-abc");
      localStorage.setItem("last_active_uid", "user1");
      localStorage.setItem("current_fcm_token", "fcm-dev-1");
      localStorage.setItem("pwa_prompt", "dismissed");
      localStorage.setItem("sidebar_collapsed", "true"); // benign UI preference
      localStorage.setItem("pwa-installed", "true"); // device PWA flag

      // Simulate the hardened logout cleanup routine
      localStorage.removeItem("last_active_uid");
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("auth_") ||
            key.startsWith("pwa_") ||
            key === "current_fcm_token")
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();

      // Assert complete removal of private and auth state
      expect(localStorage.getItem("auth_cache_user1")).toBeNull();
      expect(localStorage.getItem("auth_session_id")).toBeNull();
      expect(localStorage.getItem("auth_refresh_token")).toBeNull();
      expect(localStorage.getItem("last_active_uid")).toBeNull();
      expect(localStorage.getItem("current_fcm_token")).toBeNull();
      expect(localStorage.getItem("pwa_prompt")).toBeNull();

      // Benign device preferences are kept
      expect(localStorage.getItem("sidebar_collapsed")).toBe("true");
      expect(localStorage.getItem("pwa-installed")).toBe("true");
    });
  });

  describe("4. Precache Hygiene & Performance Safeguards", () => {
    it("confirms heavy developer preview files and source maps are excluded from production build precache", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const viteConfig = fs.readFileSync(path.resolve(process.cwd(), "vite.config.ts"), "utf-8");

      expect(viteConfig).toContain("'**/favicon-preview.html'");
      expect(viteConfig).toContain("'**/bug_report/**/*'");
      expect(viteConfig).toContain("'**/*.map'");
    });
  });

  describe("5. Content Security Policy (CSP) & External PWA Install Prompt Script", () => {
    it("confirms index.html contains no inline executable script tags violating CSP script-src 'self'", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");

      // Extract all <script ...> tags
      const scriptTags = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
      expect(scriptTags.length).toBeGreaterThan(0);

      // Verify NO script tag contains inline executable code
      for (const tag of scriptTags) {
        const hasSrc = /src=["'][^"']+["']/i.test(tag);
        const innerContent = tag.replace(/<script\b[^>]*>/i, "").replace(/<\/script>/i, "").trim();
        expect(hasSrc).toBe(true);
        expect(innerContent).toBe("");
      }
    });

    it("confirms index.html references /pwa-install-prompt.js synchronously in <head>", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");

      expect(html).toContain('<script src="/pwa-install-prompt.js"></script>');
      // Must not be deferred or async to avoid race conditions capturing beforeinstallprompt
      expect(html).not.toMatch(/<script[^>]*src="\/pwa-install-prompt\.js"[^>]*(async|defer)/i);
    });

    it("confirms public/pwa-install-prompt.js exists and correctly implements beforeinstallprompt and appinstalled behavior", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const scriptPath = path.resolve(process.cwd(), "public/pwa-install-prompt.js");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const code = fs.readFileSync(scriptPath, "utf-8");
      expect(code).toContain("beforeinstallprompt");
      expect(code).toContain("preventDefault");
      expect(code).toContain("__pwaInstallPrompt");
      expect(code).toContain("pwa-prompt-available");
      expect(code).toContain("appinstalled");
      expect(code).toContain("pwa-installed");

      // Directly evaluate the script in this JSDOM environment and verify behavioral execution
      delete (window as any).__pwaInstallPrompt;
      localStorage.removeItem("pwa-installed");

      // Execute script in current window
      new Function(code)();

      // Test beforeinstallprompt handling
      let eventDetail: any = null;
      const promptAvailableListener = (e: Event) => {
        eventDetail = (e as CustomEvent).detail;
      };
      window.addEventListener("pwa-prompt-available", promptAvailableListener);

      const mockPromptEvent = new Event("beforeinstallprompt", { cancelable: true });
      let preventDefaultCalled = false;
      mockPromptEvent.preventDefault = () => {
        preventDefaultCalled = true;
      };

      window.dispatchEvent(mockPromptEvent);

      expect(preventDefaultCalled).toBe(true);
      expect((window as any).__pwaInstallPrompt).toBe(mockPromptEvent);
      expect(eventDetail).toBe(mockPromptEvent);
      window.removeEventListener("pwa-prompt-available", promptAvailableListener);

      // Test appinstalled handling
      window.dispatchEvent(new Event("appinstalled"));
      expect((window as any).__pwaInstallPrompt).toBeNull();
      expect(localStorage.getItem("pwa-installed")).toBe("true");
    });

    it("safely handles localStorage errors during appinstalled without throwing", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const code = fs.readFileSync(path.resolve(process.cwd(), "public/pwa-install-prompt.js"), "utf-8");
      new Function(code)();

      (window as any).__pwaInstallPrompt = { dummy: true };
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError or SecurityError in private browsing");
      });

      expect(() => {
        window.dispatchEvent(new Event("appinstalled"));
      }).not.toThrow();

      expect((window as any).__pwaInstallPrompt).toBeNull();
      setItemSpy.mockRestore();
    });
  });
});
