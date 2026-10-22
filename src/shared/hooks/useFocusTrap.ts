import { useEffect, useRef, type RefObject } from "react";

export interface FocusTrapOptions {
  /** Explicitly designated element to receive focus when trap activates */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Explicit element to restore focus to when trap deactivates */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Optional Escape key handler. If omitted, Escape key is ignored */
  onEscape?: () => void;
  /** Whether to automatically move focus on activation (defaults to true) */
  autoFocus?: boolean;
  /** Whether to restore focus to previous element on deactivation (defaults to true) */
  restoreFocus?: boolean;
}

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");

// Global stack to support nested or overlapping dialog traps cleanly
const trapStack: HTMLElement[] = [];

/**
 * Retrieves all currently focusable and visible elements inside a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
  );

  return elements.filter((el) => {
    // Basic attribute guards
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") {
      return false;
    }

    // Fast-path inline style check
    if (el.style.display === "none" || el.style.visibility === "hidden") {
      return false;
    }

    // Modern browser visibility API if supported
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) {
        return false;
      }
    }

    // Computed style check for elements hidden via CSS classes (e.g. .hidden)
    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      try {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
      } catch {
        // Fallback for detached nodes or edge cases
      }
    }

    return true;
  });
}

/** Reset helper for testing */
export function _resetTrapStack() {
  trapStack.length = 0;
}

/** Get stack depth for testing */
export function _getTrapStackDepth(): number {
  return trapStack.length;
}

/**
 * Custom hook to trap keyboard focus within a modal or dialog container.
 *
 * Guarantees:
 * 1. Initial focus lands inside the dialog (or on initialFocusRef).
 * 2. Tab and Shift+Tab cycle within focusable elements.
 * 3. Focus restores to the previously active element upon closing/unmounting.
 * 4. Nested dialogs are supported cleanly via stack tracking.
 * 5. Escape handling is strictly opt-in via options.onEscape.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean = true,
  options: FocusTrapOptions = {}
) {
  const {
    initialFocusRef,
    returnFocusRef,
    onEscape,
    autoFocus = true,
    restoreFocus = true,
  } = options;

  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Capture element that had focus BEFORE this trap opened
    // Guard: only capture if current activeElement is not already inside this container
    if (
      document.activeElement &&
      !container.contains(document.activeElement)
    ) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
    }

    // Push this container to the trap stack
    trapStack.push(container);

    // Initial focus placement
    if (autoFocus) {
      // Use requestAnimationFrame or setTimeout to allow DOM to finish rendering
      const focusTimer = requestAnimationFrame(() => {
        if (!container.isConnected) return;

        if (initialFocusRef?.current && container.contains(initialFocusRef.current)) {
          initialFocusRef.current.focus();
        } else {
          const focusables = getFocusableElements(container);
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            // If no focusable descendants, focus the container itself (fallback)
            if (!container.hasAttribute("tabindex")) {
              container.setAttribute("tabindex", "-1");
            }
            container.focus();
          }
        }
      });

      // Cleanup initial focus request if unmounted immediately
      return () => {
        cancelAnimationFrame(focusTimer);
        cleanupTrap(container);
      };
    }

    return () => {
      cleanupTrap(container);
    };

    function cleanupTrap(el: HTMLElement) {
      // Remove this container from the trap stack
      const index = trapStack.lastIndexOf(el);
      if (index !== -1) {
        trapStack.splice(index, 1);
      }

      // Restore focus if configured
      if (restoreFocus) {
        const targetToRestore =
          returnFocusRef?.current || previouslyFocusedRef.current;

        if (
          targetToRestore &&
          targetToRestore.isConnected &&
          typeof targetToRestore.focus === "function"
        ) {
          // Wrap in requestAnimationFrame to avoid collisions with DOM unmounting
          requestAnimationFrame(() => {
            if (targetToRestore.isConnected) {
              targetToRestore.focus();
            }
          });
        }
      }
    }
  }, [isActive, containerRef, initialFocusRef, returnFocusRef, autoFocus, restoreFocus]);

  // Tab & Escape Keydown Listener
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Only the topmost trap on the stack intercepts keyboard events
      if (trapStack[trapStack.length - 1] !== container) return;

      if (e.key === "Escape") {
        if (onEscapeRef.current) {
          e.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }

      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(container);

      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (e.shiftKey) {
        // Shift + Tab: backwards
        if (activeElement === firstElement || !container.contains(activeElement)) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: forwards
        if (activeElement === lastElement || !container.contains(activeElement)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, containerRef]);
}
