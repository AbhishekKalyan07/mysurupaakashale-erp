import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef, useState, act } from "react";
import { createRoot } from "react-dom/client";
import {
  useFocusTrap,
  _resetTrapStack,
  _getTrapStackDepth,
  getFocusableElements,
} from "../useFocusTrap";

function TestModal({
  isOpen,
  onEscape,
  useCustomInitial,
  onClose,
  hasNoFocusables,
}: {
  isOpen: boolean;
  onEscape?: () => void;
  useCustomInitial?: boolean;
  onClose?: () => void;
  hasNoFocusables?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const secondBtnRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(panelRef, isOpen, {
    onEscape,
    initialFocusRef: useCustomInitial ? secondBtnRef : undefined,
  });

  if (!isOpen) return null;

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" data-testid="dialog">
      {hasNoFocusables ? (
        <p>No interactive elements</p>
      ) : (
        <>
          <button id="btn-first" data-testid="btn-first">
            First
          </button>
          <button ref={secondBtnRef} id="btn-second" data-testid="btn-second">
            Second
          </button>
          <input id="input-third" data-testid="input-third" type="text" />
          <button id="btn-last" data-testid="btn-last" onClick={onClose}>
            Last
          </button>
        </>
      )}
    </div>
  );
}

function NestedModalsContainer() {
  const [modal1Open, setModal1Open] = useState(false);
  const [modal2Open, setModal2Open] = useState(false);

  const panel1Ref = useRef<HTMLDivElement>(null);
  const panel2Ref = useRef<HTMLDivElement>(null);

  useFocusTrap(panel1Ref, modal1Open);
  useFocusTrap(panel2Ref, modal2Open);

  return (
    <div>
      <button id="open-modal-1" onClick={() => setModal1Open(true)}>
        Open Modal 1
      </button>

      {modal1Open && (
        <div ref={panel1Ref} role="dialog" id="modal-1">
          <button id="m1-btn-1">M1 First</button>
          <button id="open-modal-2" onClick={() => setModal2Open(true)}>
            Open Modal 2
          </button>
          <button id="close-modal-1" onClick={() => setModal1Open(false)}>
            Close M1
          </button>
        </div>
      )}

      {modal2Open && (
        <div ref={panel2Ref} role="dialog" id="modal-2">
          <button id="m2-btn-1">M2 First</button>
          <button id="close-modal-2" onClick={() => setModal2Open(false)}>
            Close M2
          </button>
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap Hook Suite", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    _resetTrapStack();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container!);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
    _resetTrapStack();
  });

  it("1. automatically moves focus to the first focusable element on open", async () => {
    await act(async () => {
      root!.render(<TestModal isOpen={true} />);
    });

    // Wait a tick for requestAnimationFrame
    await new Promise((r) => setTimeout(r, 50));

    const firstBtn = container!.querySelector("#btn-first") as HTMLElement;
    expect(document.activeElement).toBe(firstBtn);
    expect(_getTrapStackDepth()).toBe(1);
  });

  it("2. supports an explicitly designated initialFocusRef element", async () => {
    await act(async () => {
      root!.render(<TestModal isOpen={true} useCustomInitial={true} />);
    });

    await new Promise((r) => setTimeout(r, 50));

    const secondBtn = container!.querySelector("#btn-second") as HTMLElement;
    expect(document.activeElement).toBe(secondBtn);
  });

  it("3. cycles focus from the last element to the first on Tab", async () => {
    await act(async () => {
      root!.render(<TestModal isOpen={true} />);
    });

    await new Promise((r) => setTimeout(r, 50));

    const firstBtn = container!.querySelector("#btn-first") as HTMLElement;
    const lastBtn = container!.querySelector("#btn-last") as HTMLElement;

    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(firstBtn);
  });

  it("4. cycles focus from the first element to the last on Shift+Tab", async () => {
    await act(async () => {
      root!.render(<TestModal isOpen={true} />);
    });

    await new Promise((r) => setTimeout(r, 50));

    const firstBtn = container!.querySelector("#btn-first") as HTMLElement;
    const lastBtn = container!.querySelector("#btn-last") as HTMLElement;

    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(lastBtn);
  });

  it("5. handles dialogs with no focusable descendants safely without throwing", async () => {
    await act(async () => {
      root!.render(<TestModal isOpen={true} hasNoFocusables={true} />);
    });

    await new Promise((r) => setTimeout(r, 50));

    const dialog = container!.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute("tabindex")).toBe("-1");

    expect(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    }).not.toThrow();
  });

  it("6. restores focus to the previously active element when unmounted/closed", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button id="trigger-btn" onClick={() => setOpen(true)}>
            Open
          </button>
          <TestModal isOpen={open} onClose={() => setOpen(false)} />
        </div>
      );
    }

    await act(async () => {
      root!.render(<Host />);
    });

    const trigger = container!.querySelector("#trigger-btn") as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open modal
    await act(async () => {
      trigger.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(container!.querySelector("#btn-first"));

    // Close modal
    const closeBtn = container!.querySelector("#btn-last") as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(trigger);
    expect(_getTrapStackDepth()).toBe(0);
  });

  it("7. handles disconnected trigger elements gracefully upon restoration", async () => {
    function HostWithDisappearingTrigger() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          {!open && (
            <button id="temp-trigger" onClick={() => setOpen(true)}>
              Temp Trigger
            </button>
          )}
          <TestModal isOpen={open} onClose={() => setOpen(false)} />
        </div>
      );
    }

    await act(async () => {
      root!.render(<HostWithDisappearingTrigger />);
    });

    const trigger = container!.querySelector("#temp-trigger") as HTMLButtonElement;
    trigger.focus();

    await act(async () => {
      trigger.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(container!.querySelector("#btn-first"));

    // Trigger is unmounted, closing should not throw
    const closeBtn = container!.querySelector("#btn-last") as HTMLButtonElement;
    await act(async () => {
      expect(() => closeBtn.click()).not.toThrow();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(_getTrapStackDepth()).toBe(0);
  });

  it("8. executes optional onEscape only when provided and ignores Escape when omitted", async () => {
    const onEscapeMock = vi.fn();

    // With onEscape
    await act(async () => {
      root!.render(<TestModal isOpen={true} onEscape={onEscapeMock} />);
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onEscapeMock).toHaveBeenCalledTimes(1);

    // Without onEscape
    await act(async () => {
      root!.render(<TestModal isOpen={true} />);
    });

    expect(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }).not.toThrow();
  });

  it("9. supports nested dialogs without breaking stack or stealing focus", async () => {
    await act(async () => {
      root!.render(<NestedModalsContainer />);
    });

    const openM1 = container!.querySelector("#open-modal-1") as HTMLButtonElement;
    await act(async () => {
      openM1.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(container!.querySelector("#m1-btn-1"));
    expect(_getTrapStackDepth()).toBe(1);

    // Open Modal 2 from inside Modal 1
    const openM2 = container!.querySelector("#open-modal-2") as HTMLButtonElement;
    await act(async () => {
      openM2.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(container!.querySelector("#m2-btn-1"));
    expect(_getTrapStackDepth()).toBe(2);

    // Close Modal 2
    const closeM2 = container!.querySelector("#close-modal-2") as HTMLButtonElement;
    await act(async () => {
      closeM2.click();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(_getTrapStackDepth()).toBe(1);

    // Tab key now operates on Modal 1 (topmost remaining trap)
    const m1Close = container!.querySelector("#close-modal-1") as HTMLButtonElement;
    m1Close.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: false, bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(container!.querySelector("#m1-btn-1"));
  });

  it("10. correctly filters out disabled or hidden elements in getFocusableElements (including CSS classes)", () => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .css-hidden { display: none; }
      .css-invisible { visibility: hidden; }
    `;
    document.head.appendChild(styleEl);

    const testDiv = document.createElement("div");
    testDiv.innerHTML = `
      <button id="b1">Active</button>
      <button id="b2" disabled>Disabled</button>
      <button id="b3" style="display: none">Hidden Display</button>
      <button id="b4" aria-hidden="true">Hidden Aria</button>
      <button id="b5" class="css-hidden">CSS Class Hidden</button>
      <button id="b6" class="css-invisible">CSS Class Invisible</button>
      <a id="a1" href="https://example.com">Link</a>
      <input id="i1" type="hidden" />
      <input id="i2" type="text" />
      <div id="d1" tabindex="-1">Not in tab order</div>
      <div id="d2" tabindex="0">Custom Tab Stop</div>
    `;
    document.body.appendChild(testDiv);

    const focusables = getFocusableElements(testDiv);
    expect(focusables.map((el) => el.id)).toEqual(["b1", "a1", "i2", "d2"]);

    document.body.removeChild(testDiv);
    document.head.removeChild(styleEl);
  });
});
