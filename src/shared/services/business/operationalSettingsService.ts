import { doc } from "firebase/firestore";
import * as firebaseLib from "@/shared/lib/firebase";
import { getTodayInTimezone, getCachedDateTimeFormatter } from "@/shared/lib/date";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import type { MealType, TimeWindow, BusinessSettings } from "@/shared/types";
import { AUTHORITATIVE_OPERATIONAL_CUTOFFS } from "@/shared/types";

function getFallbackAuth(): any {
  try {
    return (firebaseLib as Record<string, any>).auth ?? null;
  } catch {
    return null;
  }
}

function getFallbackDb(): any {
  try {
    return (firebaseLib as Record<string, any>).db ?? null;
  } catch {
    return null;
  }
}

export interface OperationalCutoffTimes {
  breakfast: string; // "HH:mm"
  lunch: string;     // "HH:mm"
  dinner: string;    // "HH:mm"
}

export interface OperationalDeliveryWindows {
  breakfast: TimeWindow; // { start: "HH:mm", end: "HH:mm" }
  lunch: TimeWindow;
  dinner: TimeWindow;
}

export interface OperationalSettings {
  cutoffs: OperationalCutoffTimes;
  deliveryWindows: OperationalDeliveryWindows;
}

export const DEFAULT_CUTOFFS: OperationalCutoffTimes = {
  ...AUTHORITATIVE_OPERATIONAL_CUTOFFS,
};

export const DEFAULT_DELIVERY_WINDOWS: OperationalDeliveryWindows = {
  breakfast: { start: "07:30", end: "09:00" },
  lunch: { start: "12:30", end: "14:00" },
  dinner: { start: "19:30", end: "21:00" },
};

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class OperationalSettingsService {
  private cache: OperationalSettings = {
    cutoffs: { ...DEFAULT_CUTOFFS },
    deliveryWindows: {
      breakfast: { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
      lunch: { ...DEFAULT_DELIVERY_WINDOWS.lunch },
      dinner: { ...DEFAULT_DELIVERY_WINDOWS.dinner },
    },
  };
  private cacheLoaded = false;
  private hasSuccessfullyLoadedFromFirestore = false;
  private loadPromise: Promise<OperationalSettings> | null = null;
  private unsubscribeRealtime: (() => void) | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private currentSessionId = 0;
  private currentUserId: string | null = null;
  private subscribers = new Set<(settings: OperationalSettings) => void>();
  private readonly customAuth?: any;
  private readonly customDb?: any;
  private authSessionResolved = false;

  constructor(customAuth?: any, customDb?: any) {
    this.customAuth = customAuth;
    this.customDb = customDb;

    const authInst = this.getAuth();
    if (authInst && typeof authInst.onAuthStateChanged === "function") {
      // Dynamic auth provider with lifecycle observation
      if (
        customAuth !== undefined ||
        (typeof window !== "undefined" && (typeof process === "undefined" || process.env.NODE_ENV !== "test"))
      ) {
        this.initAuthLifecycle();
      }
      // authSessionResolved remains false until onAuthStateChanged or handleAuthStateChanged fires
    } else {
      // Static auth provider (e.g. test mock without onAuthStateChanged): session is immediately resolved
      this.authSessionResolved = true;
    }
  }

  private getAuth(): any {
    if (this.customAuth !== undefined) {
      return this.customAuth;
    }
    return getFallbackAuth();
  }

  private getDb(): any {
    if (this.customDb !== undefined) {
      return this.customDb;
    }
    return getFallbackDb();
  }

  /**
   * Initializes the Firebase Auth observer to track sign-in/sign-out transitions.
   */
  initAuthLifecycle(): void {
    if (this.authUnsubscribe) return;
    const authInst = this.getAuth();
    if (!authInst) return;

    try {
      import("firebase/auth")
        .then((authMod) => {
          const onAuth =
            authMod?.onAuthStateChanged ||
            authInst?.onAuthStateChanged;
          if (typeof onAuth === "function") {
            this.authUnsubscribe = onAuth(authInst, (user: any) => {
              this.authSessionResolved = true;
              this.handleAuthStateChanged(user).catch(() => {});
            });
          } else if (authInst?.currentUser) {
            this.authSessionResolved = true;
            this.handleAuthStateChanged(authInst.currentUser).catch(() => {});
          }
        })
        .catch(() => {
          if (authInst?.currentUser) {
            this.authSessionResolved = true;
            this.handleAuthStateChanged(authInst.currentUser).catch(() => {});
          }
        });
    } catch {
      if (authInst?.currentUser) {
        this.authSessionResolved = true;
        this.handleAuthStateChanged(authInst.currentUser).catch(() => {});
      }
    }
  }

  /**
   * Handles authentication state changes.
   * If a user is signed in, loads settings from Firestore and begins realtime sync.
   * If signed out, stops realtime sync, resets cache to defaults, and notifies subscribers.
   */
  async handleAuthStateChanged(user: any): Promise<void> {
    if (user && user.uid) {
      if (this.currentUserId === user.uid && this.hasSuccessfullyLoadedFromFirestore) {
        // Already loaded and active for this exact user.
        // Ensure realtime sync is running if supported.
        if (
          !this.unsubscribeRealtime &&
          typeof window !== "undefined" &&
          (typeof process === "undefined" || process.env.NODE_ENV !== "test")
        ) {
          this.startRealtimeSync().catch(() => {});
        }
        return;
      }

      const sessionId = ++this.currentSessionId;
      this.currentUserId = user.uid;

      // Clean up previous realtime listener before starting a new one
      this.stopRealtimeSync();

      try {
        await this.getOperationalSettings(true);
      } catch {
        // Errors are logged and handled inside getOperationalSettings without latching
      }

      // Check if session changed while load was in flight
      if (this.currentSessionId !== sessionId) return;

      if (
        typeof window !== "undefined" &&
        (typeof process === "undefined" || process.env.NODE_ENV !== "test")
      ) {
        this.startRealtimeSync().catch(() => {});
      }
    } else {
      // User signed out or guest: clean up listeners and revert to fallback defaults
      this.currentSessionId++;
      this.currentUserId = null;
      this.stopRealtimeSync();
      this.clearCache();
      this.notifySubscribers();
    }
  }

  /**
   * Subscribes to operational settings updates.
   * Immediately calls the subscriber with the current settings snapshot.
   * Returns an unsubscribe function.
   */
  subscribe(callback: (settings: OperationalSettings) => void): () => void {
    this.subscribers.add(callback);
    try {
      callback(this.getOperationalSettingsSync());
    } catch (err) {
      console.error("[OperationalSettingsService] Error in subscriber callback:", err);
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Broadcasts the current cached settings to all registered subscribers.
   */
  private notifySubscribers(): void {
    const current = this.getOperationalSettingsSync();
    for (const sub of this.subscribers) {
      try {
        sub(current);
      } catch (err) {
        console.error("[OperationalSettingsService] Error in subscriber callback:", err);
      }
    }
  }

  /**
   * Returns whether a realtime Firestore listener is currently active.
   */
  isRealtimeSyncActive(): boolean {
    return this.unsubscribeRealtime !== null;
  }

  /**
   * Returns the user ID of the currently active authenticated session, if any.
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Starts a real-time Firestore listener on the authoritative /settings/business document.
   * Keeps the in-memory cache synchronized across multiple browser tabs and admin updates.
   */
  async startRealtimeSync(): Promise<void> {
    if (this.unsubscribeRealtime) return;

    // Do not attempt realtime sync if unauthenticated or session unresolved
    const authInst = this.getAuth();
    const currentUser = authInst?.currentUser;
    if (!this.authSessionResolved || (!currentUser && !this.currentUserId)) return;

    const dbInst = this.getDb();
    if (!dbInst) return;

    const sessionId = this.currentSessionId;
    try {
      const firestore = await import("firebase/firestore");
      if (typeof firestore.onSnapshot !== "function") return;
      const docRef = doc(dbInst, "settings", "business");
      this.unsubscribeRealtime = firestore.onSnapshot(
        docRef,
        (snap: any) => {
          if (this.currentSessionId !== sessionId) return;

          if (snap && typeof snap.exists === "function" && snap.exists()) {
            const data = snap.data() as Partial<BusinessSettings>;
            const ops = data.operations;
            if (ops?.cancellationCutoffTimes || ops?.deliveryWindows) {
              const cutoffs: OperationalCutoffTimes = {
                breakfast: ops?.cancellationCutoffTimes?.breakfast || DEFAULT_CUTOFFS.breakfast,
                lunch: ops?.cancellationCutoffTimes?.lunch || DEFAULT_CUTOFFS.lunch,
                dinner: ops?.cancellationCutoffTimes?.dinner || DEFAULT_CUTOFFS.dinner,
              };
              const deliveryWindows: OperationalDeliveryWindows = {
                breakfast: ops?.deliveryWindows?.breakfast
                  ? { start: ops.deliveryWindows.breakfast.start, end: ops.deliveryWindows.breakfast.end }
                  : { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
                lunch: ops?.deliveryWindows?.lunch
                  ? { start: ops.deliveryWindows.lunch.start, end: ops.deliveryWindows.lunch.end }
                  : { ...DEFAULT_DELIVERY_WINDOWS.lunch },
                dinner: ops?.deliveryWindows?.dinner
                  ? { start: ops.deliveryWindows.dinner.start, end: ops.deliveryWindows.dinner.end }
                  : { ...DEFAULT_DELIVERY_WINDOWS.dinner },
              };
              this.cache = { cutoffs, deliveryWindows };
              this.cacheLoaded = true;
              this.hasSuccessfullyLoadedFromFirestore = true;
              this.notifySubscribers();
            }
          }
        },
        (err: any) => {
          console.warn("[OperationalSettingsService] Realtime sync listener warning:", err);
          // Clean up on error so subsequent attempts can re-subscribe
          this.stopRealtimeSync();
        },
      );
    } catch (err) {
      console.warn("[OperationalSettingsService] Failed to start realtime sync:", err);
      this.unsubscribeRealtime = null;
    }
  }

  /**
   * Stops real-time listener (useful for tests or teardown).
   */
  stopRealtimeSync(): void {
    if (this.unsubscribeRealtime) {
      try {
        this.unsubscribeRealtime();
      } catch {}
      this.unsubscribeRealtime = null;
    }
  }

  /**
   * Returns whether the current cache has been populated by a successful Firestore read.
   */
  isLoadedFromFirestore(): boolean {
    return this.hasSuccessfullyLoadedFromFirestore;
  }

  /**
   * Validates if a string is in 24-hour "HH:mm" format.
   */
  validateTimeFormat(time: string): boolean {
    return typeof time === "string" && TIME_REGEX.test(time.trim());
  }

  /**
   * Validates a delivery window ensuring valid time formats and start < end.
   */
  validateDeliveryWindow(window: { start: string; end: string }): {
    valid: boolean;
    error?: string;
  } {
    if (!window || typeof window !== "object") {
      return { valid: false, error: "Delivery window object is required." };
    }
    if (!this.validateTimeFormat(window.start)) {
      return { valid: false, error: `Invalid start time format: '${window.start}'. Expected HH:mm.` };
    }
    if (!this.validateTimeFormat(window.end)) {
      return { valid: false, error: `Invalid end time format: '${window.end}'. Expected HH:mm.` };
    }
    if (window.start >= window.end) {
      return { valid: false, error: `Delivery window start time (${window.start}) must be before end time (${window.end}).` };
    }
    return { valid: true };
  }

  /**
   * Authoritatively retrieves operational settings from Firestore, updating the runtime cache.
   * If Firestore temporarily fails, retains the last successfully loaded configuration.
   * Fallback defaults are used ONLY when the persisted settings document is genuinely unavailable.
   */
  async getOperationalSettings(forceRefresh = false): Promise<OperationalSettings> {
    if (this.cacheLoaded && !forceRefresh) {
      return this.getOperationalSettingsSync();
    }

    if (this.loadPromise && !forceRefresh) {
      return this.loadPromise;
    }

    const authInst = this.getAuth();
    const currentUser = authInst?.currentUser;
    if (!this.authSessionResolved || (!currentUser && !this.currentUserId)) {
      // Unauthenticated or session unresolved: do not attempt protected Firestore read
      return this.getOperationalSettingsSync();
    }

    this.loadPromise = (async () => {
      const sessionId = this.currentSessionId;
      try {
        const dbInst = this.getDb();
        if (!dbInst) {
          return this.getOperationalSettingsSync();
        }

        const firestore = await import("firebase/firestore");
        if (typeof firestore.getDoc !== "function") {
          return this.getOperationalSettingsSync();
        }
        const docRef = doc(dbInst, "settings", "business");
        const snap = await firestore.getDoc(docRef);

        if (this.currentSessionId !== sessionId) {
          return this.getOperationalSettingsSync();
        }

        if (snap && typeof snap.exists === "function" && snap.exists()) {
          const data = snap.data() as Partial<BusinessSettings>;
          const ops = data.operations;

          const cutoffs: OperationalCutoffTimes = {
            breakfast: ops?.cancellationCutoffTimes?.breakfast || DEFAULT_CUTOFFS.breakfast,
            lunch: ops?.cancellationCutoffTimes?.lunch || DEFAULT_CUTOFFS.lunch,
            dinner: ops?.cancellationCutoffTimes?.dinner || DEFAULT_CUTOFFS.dinner,
          };

          const deliveryWindows: OperationalDeliveryWindows = {
            breakfast: ops?.deliveryWindows?.breakfast
              ? { start: ops.deliveryWindows.breakfast.start, end: ops.deliveryWindows.breakfast.end }
              : { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
            lunch: ops?.deliveryWindows?.lunch
              ? { start: ops.deliveryWindows.lunch.start, end: ops.deliveryWindows.lunch.end }
              : { ...DEFAULT_DELIVERY_WINDOWS.lunch },
            dinner: ops?.deliveryWindows?.dinner
              ? { start: ops.deliveryWindows.dinner.start, end: ops.deliveryWindows.dinner.end }
              : { ...DEFAULT_DELIVERY_WINDOWS.dinner },
          };

          this.cache = { cutoffs, deliveryWindows };
          this.cacheLoaded = true;
          this.hasSuccessfullyLoadedFromFirestore = true;
          this.notifySubscribers();
        } else {
          // Document genuinely missing in Firestore - use baseline defaults
          if (!this.hasSuccessfullyLoadedFromFirestore) {
            this.cache = {
              cutoffs: { ...DEFAULT_CUTOFFS },
              deliveryWindows: {
                breakfast: { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
                lunch: { ...DEFAULT_DELIVERY_WINDOWS.lunch },
                dinner: { ...DEFAULT_DELIVERY_WINDOWS.dinner },
              },
            };
          }
          this.cacheLoaded = true;
          this.notifySubscribers();
        }
      } catch (err) {
        // Fallback safety: if Firestore temporarily fails, retain the last successfully loaded configuration
        if (this.hasSuccessfullyLoadedFromFirestore) {
          console.warn("[OperationalSettingsService] Firestore read failed; retaining previously loaded configuration:", err);
        } else {
          console.warn("[OperationalSettingsService] Failed to load settings from Firestore, using fallback defaults:", err);
          this.cache = {
            cutoffs: { ...DEFAULT_CUTOFFS },
            deliveryWindows: {
              breakfast: { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
              lunch: { ...DEFAULT_DELIVERY_WINDOWS.lunch },
              dinner: { ...DEFAULT_DELIVERY_WINDOWS.dinner },
            },
          };
          // Do not latch cacheLoaded to true on failure when unseeded, allowing subsequent retries
          this.cacheLoaded = false;
        }
      } finally {
        this.loadPromise = null;
      }
      return this.getOperationalSettingsSync();
    })();

    return this.loadPromise;
  }

  /**
   * Forces a reload from the authoritative Firestore document.
   */
  async reloadFromFirestore(): Promise<OperationalSettings> {
    return this.getOperationalSettings(true);
  }

  /**
   * Synchronously returns cached operational settings or defaults.
   */
  getOperationalSettingsSync(): OperationalSettings {
    return {
      cutoffs: { ...this.cache.cutoffs },
      deliveryWindows: {
        breakfast: { ...this.cache.deliveryWindows.breakfast },
        lunch: { ...this.cache.deliveryWindows.lunch },
        dinner: { ...this.cache.deliveryWindows.dinner },
      },
    };
  }

  /**
   * Returns the cutoff time string ("HH:mm") for a given meal slot.
   */
  async getMealCutoff(mealType: MealType): Promise<string> {
    const settings = await this.getOperationalSettings();
    return settings.cutoffs[mealType] || DEFAULT_CUTOFFS[mealType];
  }

  /**
   * Synchronously returns the cutoff time string ("HH:mm") for a given meal slot.
   */
  getMealCutoffSync(mealType: MealType): string {
    return this.cache.cutoffs[mealType] || DEFAULT_CUTOFFS[mealType];
  }

  /**
   * Returns the frozen TimeWindow snapshot ({ start, end }) for a given meal slot.
   */
  async getDeliveryWindow(mealType: MealType): Promise<TimeWindow> {
    const settings = await this.getOperationalSettings();
    const win = settings.deliveryWindows[mealType] || DEFAULT_DELIVERY_WINDOWS[mealType];
    return { start: win.start, end: win.end };
  }

  /**
   * Synchronously returns the TimeWindow snapshot for a given meal slot.
   */
  getDeliveryWindowSync(mealType: MealType): TimeWindow {
    const win = this.cache.deliveryWindows[mealType] || DEFAULT_DELIVERY_WINDOWS[mealType];
    return { start: win.start, end: win.end };
  }

  /**
   * Validates whether a meal change / cancellation / add action is permitted for the given date.
   * Enforces:
   * - Past date: rejected
   * - Future date: allowed
   * - Today: before cutoff = allowed, exact cutoff = rejected, after cutoff = rejected
   * Timezone: Asia/Kolkata
   */
  validateMealCutoff(
    mealType: MealType,
    date: string,
    nowOverride?: Date,
  ): void {
    const now = nowOverride || new Date();
    const today = getTodayInTimezone("Asia/Kolkata", now);

    if (date < today) {
      throw new Error("Cannot modify skips for past dates.");
    }

    if (date > today) {
      return; // Future dates are always allowed
    }

    // Today in Asia/Kolkata: check time
    const cutoffStr = this.getMealCutoffSync(mealType);
    const [cutoffH, cutoffM] = cutoffStr.split(":").map((v) => parseInt(v, 10));
    const cutoffTotalSeconds = cutoffH * 3600 + cutoffM * 60;

    // Get current time in Asia/Kolkata
    const parts = getCachedDateTimeFormatter("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);

    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const second = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);

    const nowTotalSeconds = hour * 3600 + minute * 60 + second;

    // before cutoff = allowed (<)
    // exact cutoff = rejected (>=)
    // after cutoff = rejected (>=)
    if (nowTotalSeconds >= cutoffTotalSeconds) {
      throw new Error(`Cancellation window has closed for ${mealType}.`);
    }
  }

  /**
   * Admin-only authoritative operational settings update.
   * Validates cutoffs and delivery windows, saves to Firestore, updates cache, and logs audit event.
   */
  async updateOperationalSettings(
    actor: { uid: string; role: string; fullName?: string },
    newSettings: {
      cutoffs?: Partial<OperationalCutoffTimes>;
      deliveryWindows?: Partial<OperationalDeliveryWindows>;
    },
  ): Promise<OperationalSettings> {
    if (!actor || actor.role !== "admin") {
      throw new Error("Unauthorized: Only Admin can update operational settings.");
    }

    // Validate cutoffs
    if (newSettings.cutoffs) {
      for (const [meal, time] of Object.entries(newSettings.cutoffs)) {
        if (time && !this.validateTimeFormat(time)) {
          throw new Error(`Invalid cutoff time format for ${meal}: '${time}'. Expected HH:mm.`);
        }
      }
    }

    // Validate delivery windows
    if (newSettings.deliveryWindows) {
      for (const [meal, win] of Object.entries(newSettings.deliveryWindows)) {
        if (win) {
          const validation = this.validateDeliveryWindow(win);
          if (!validation.valid) {
            throw new Error(`Invalid delivery window for ${meal}: ${validation.error}`);
          }
        }
      }
    }

    const beforeSettings = await this.getOperationalSettings();

    const mergedCutoffs: OperationalCutoffTimes = {
      breakfast: newSettings.cutoffs?.breakfast || beforeSettings.cutoffs.breakfast,
      lunch: newSettings.cutoffs?.lunch || beforeSettings.cutoffs.lunch,
      dinner: newSettings.cutoffs?.dinner || beforeSettings.cutoffs.dinner,
    };

    const mergedDeliveryWindows: OperationalDeliveryWindows = {
      breakfast: newSettings.deliveryWindows?.breakfast || beforeSettings.deliveryWindows.breakfast,
      lunch: newSettings.deliveryWindows?.lunch || beforeSettings.deliveryWindows.lunch,
      dinner: newSettings.deliveryWindows?.dinner || beforeSettings.deliveryWindows.dinner,
    };

    // Save to Firestore under /settings/business
    const dbInst = this.getDb();
    if (!dbInst) {
      throw new Error("Firestore instance not available");
    }
    const firestore = await import("firebase/firestore");
    const docRef = doc(dbInst, "settings", "business");
    const existingSnap = typeof firestore.getDoc === "function" ? await firestore.getDoc(docRef) : null;
    const existingData = existingSnap && typeof existingSnap.exists === "function" && existingSnap.exists()
      ? (existingSnap.data() as Partial<BusinessSettings>)
      : {};

    const updatedOperations = {
      ...(existingData.operations || {}),
      cancellationCutoffTimes: { ...mergedCutoffs },
      deliveryWindows: {
        breakfast: { ...mergedDeliveryWindows.breakfast },
        lunch: { ...mergedDeliveryWindows.lunch },
        dinner: { ...mergedDeliveryWindows.dinner },
      },
    };

    if (typeof firestore.setDoc === "function") {
      await firestore.setDoc(docRef, { ...existingData, id: "business", operations: updatedOperations }, { merge: true });
    }

    // Update internal cache
    this.cache = {
      cutoffs: mergedCutoffs,
      deliveryWindows: mergedDeliveryWindows,
    };
    this.cacheLoaded = true;
    this.hasSuccessfullyLoadedFromFirestore = true;
    this.notifySubscribers();

    // Log structured audit event
    try {
      await auditRepository.logAction(
        "operational_settings_updated",
        actor.uid,
        "admin",
        actor.fullName || "Admin",
        "business",
        "settings",
        {
          before: beforeSettings,
          after: this.cache,
          updatedAt: new Date().toISOString(),
        },
      );
    } catch (auditErr) {
      console.warn("[OperationalSettingsService] Failed to record audit log for settings update:", auditErr);
    }

    return this.getOperationalSettingsSync();
  }

  /**
   * Directly sets the in-memory cache for deterministic testing and mocks.
   */
  setCacheForTesting(settings: Partial<OperationalSettings>): void {
    if (settings.cutoffs) {
      this.cache.cutoffs = { ...this.cache.cutoffs, ...settings.cutoffs };
    }
    if (settings.deliveryWindows) {
      this.cache.deliveryWindows = { ...this.cache.deliveryWindows, ...settings.deliveryWindows };
    }
    this.cacheLoaded = true;
  }

  /**
   * Clears the in-memory cache completely, forcing subsequent calls to reload from Firestore.
   */
  clearCache(): void {
    this.cache = {
      cutoffs: { ...DEFAULT_CUTOFFS },
      deliveryWindows: {
        breakfast: { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
        lunch: { ...DEFAULT_DELIVERY_WINDOWS.lunch },
        dinner: { ...DEFAULT_DELIVERY_WINDOWS.dinner },
      },
    };
    this.cacheLoaded = false;
    this.hasSuccessfullyLoadedFromFirestore = false;
    this.loadPromise = null;
  }

  /**
   * Resets the cache to baseline defaults (used in test tear-down).
   */
  resetToDefaults(): void {
    this.clearCache();
    this.stopRealtimeSync();
  }

  /**
   * Fully cleans up authentication and Firestore observers.
   */
  destroy(): void {
    this.stopRealtimeSync();
    if (this.authUnsubscribe) {
      try {
        this.authUnsubscribe();
      } catch {}
      this.authUnsubscribe = null;
    }
    this.subscribers.clear();
    this.clearCache();
  }
}

export const operationalSettingsService = new OperationalSettingsService();
