import { describe, it, expect, beforeEach } from "vitest";
import { lockScroll, unlockScroll, _resetScrollLock } from "../useScrollLock";

describe("useScrollLock (lockScroll / unlockScroll)", () => {
  beforeEach(() => {
    _resetScrollLock();
    document.body.style.overflow = "auto";
  });

  it("locks body overflow to hidden when locked", () => {
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("handles nested overlays correctly via reference counting", () => {
    // Open modal 1
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    // Open modal 2 (nested/child)
    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    // Close modal 2 -> body remains locked because modal 1 is still open
    unlockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    // Close modal 1 -> all released, body restores
    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("does not decrement below zero if unlock is called excessively", () => {
    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");

    lockScroll();
    expect(document.body.style.overflow).toBe("hidden");

    unlockScroll();
    expect(document.body.style.overflow).toBe("auto");
  });
});
