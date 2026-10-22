import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState, act } from "react";
import { createRoot } from "react-dom/client";
import { PremiumModal } from "../PremiumModal";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushRaf() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe("Shared Dialogs Accessibility & Focus Trapping", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe("ConfirmDeleteDialog", () => {
    it("renders with alertdialog role, aria-modal, and labelled title", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      await act(async () => {
        root.render(
          <ConfirmDeleteDialog
            entityLabel="customer"
            entityName="Ramesh Kumar"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />,
        );
      });

      const dialog = container.querySelector('[role="alertdialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute("aria-modal")).toBe("true");

      const titleId = dialog?.getAttribute("aria-labelledby");
      expect(titleId).toBeTruthy();
      const titleEl = document.getElementById(titleId!);
      expect(titleEl?.textContent).toContain("Delete Customer");

      const descId = dialog?.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      const descEl = document.getElementById(descId!);
      expect(descEl?.textContent).toContain("Ramesh Kumar");
    });

    it("focuses the safe default (Cancel) and closes on Escape", async () => {
      const onCancel = vi.fn();

      await act(async () => {
        root.render(
          <ConfirmDeleteDialog
            entityLabel="order"
            onConfirm={vi.fn()}
            onCancel={onCancel}
          />,
        );
      });

      await flushRaf();

      const buttons = container.querySelectorAll("button");
      const cancelBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "Cancel");
      expect(document.activeElement).toBe(cancelBtn);

      // Press Escape
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("traps Tab key navigation within dialog", async () => {
      await act(async () => {
        root.render(
          <ConfirmDeleteDialog
            entityLabel="order"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />,
        );
      });

      await flushRaf();

      const focusable = Array.from(container.querySelectorAll("button"));
      const first = focusable[0]; // Close (X) button
      const last = focusable[focusable.length - 1]; // Delete button

      // Focus last and press Tab -> should wrap to first
      last.focus();
      expect(document.activeElement).toBe(last);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      });
      expect(document.activeElement).toBe(first);

      // Shift+Tab from first -> should wrap to last
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
      });
      expect(document.activeElement).toBe(last);
    });
  });

  describe("UnsavedChangesDialog", () => {
    it("renders with alertdialog role, aria-modal, and labelled title", async () => {
      await act(async () => {
        root.render(
          <UnsavedChangesDialog
            onStay={vi.fn()}
            onLeave={vi.fn()}
          />,
        );
      });

      const dialog = container.querySelector('[role="alertdialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute("aria-modal")).toBe("true");

      const titleId = dialog?.getAttribute("aria-labelledby");
      expect(titleId).toBeTruthy();
      const titleEl = document.getElementById(titleId!);
      expect(titleEl?.textContent).toContain("Leave this page?");
    });

    it("focuses Stay button and triggers onStay on Escape", async () => {
      const onStay = vi.fn();

      await act(async () => {
        root.render(
          <UnsavedChangesDialog
            onStay={onStay}
            onLeave={vi.fn()}
          />,
        );
      });

      await flushRaf();

      const buttons = container.querySelectorAll("button");
      const stayBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "Stay on page");
      expect(document.activeElement).toBe(stayBtn);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(onStay).toHaveBeenCalledTimes(1);
    });
  });

  describe("PremiumModal", () => {
    it("renders with dialog role, aria-modal, labelled title, and restores focus to trigger on close", async () => {
      let setOpenFn: (open: boolean) => void = () => {};

      function ModalHost() {
        const [open, setOpen] = useState(false);
        setOpenFn = setOpen;
        return (
          <div>
            <button id="trigger-btn" onClick={() => setOpen(true)}>
              Open Settings
            </button>
            <PremiumModal isOpen={open} onClose={() => setOpen(false)} title="Edit Settings">
              <div>
                <input id="setting-input" type="text" placeholder="Value" />
                <button id="save-btn">Save</button>
              </div>
            </PremiumModal>
          </div>
        );
      }

      await act(async () => {
        root.render(<ModalHost />);
      });

      const triggerBtn = container.querySelector("#trigger-btn") as HTMLButtonElement;
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Open modal
      await act(async () => {
        setOpenFn(true);
      });
      await flushRaf();

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute("aria-modal")).toBe("true");

      const titleId = dialog?.getAttribute("aria-labelledby");
      expect(titleId).toBeTruthy();
      const titleEl = document.getElementById(titleId!);
      expect(titleEl?.textContent).toContain("Edit Settings");

      // Focus moved into dialog (close button or first focusable element)
      const focusable = dialog?.querySelectorAll("button, input");
      expect(Array.from(focusable || [])).toContain(document.activeElement as any);

      // Close modal
      await act(async () => {
        setOpenFn(false);
      });
      await flushRaf();

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      // Focus restored to trigger
      expect(document.activeElement).toBe(triggerBtn);
    });
  });
});
