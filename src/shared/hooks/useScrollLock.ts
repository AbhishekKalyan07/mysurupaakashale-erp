import { useEffect } from "react";

let lockCount = 0;
let originalOverflow = "";

/**
 * Increment scroll lock count and lock background body scroll.
 */
export function lockScroll() {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

/**
 * Decrement scroll lock count and restore background body scroll when all locks are released.
 */
export function unlockScroll() {
  if (lockCount > 0) {
    lockCount--;
    if (lockCount === 0) {
      document.body.style.overflow = originalOverflow || "";
      originalOverflow = "";
    }
  }
}

/**
 * For testing purposes: resets the lock counter and original overflow.
 */
export function _resetScrollLock() {
  lockCount = 0;
  originalOverflow = "";
}

/**
 * Hook to lock background body scroll when an overlay, modal, or drawer is open.
 * Supports nested modals via reference counting.
 */
export function useScrollLock(isOpen: boolean = true) {
  useEffect(() => {
    if (!isOpen) return;
    lockScroll();
    return () => unlockScroll();
  }, [isOpen]);
}
