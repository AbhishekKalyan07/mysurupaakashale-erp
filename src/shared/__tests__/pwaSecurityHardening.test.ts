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
});
