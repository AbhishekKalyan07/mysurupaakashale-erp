import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QuantityStepper } from "../QuantityStepper";

describe("QuantityStepper Component", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container!);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("renders with default value and unit label", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={1} onChange={handleChange} unitLabel="Person" />);
    });

    const input = container!.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("1");
    expect(container!.textContent).toContain("Person");
  });

  it("increments within maximum limit", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={2} onChange={handleChange} min={1} max={5} />);
    });

    const incBtn = container!.querySelector('button[aria-label="Increase quantity"]') as HTMLButtonElement;
    await act(async () => {
      incBtn.click();
    });
    expect(handleChange).toHaveBeenCalledWith(3);
  });

  it("decrements within minimum limit", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={3} onChange={handleChange} min={1} max={5} />);
    });

    const decBtn = container!.querySelector('button[aria-label="Decrease quantity"]') as HTMLButtonElement;
    await act(async () => {
      decBtn.click();
    });
    expect(handleChange).toHaveBeenCalledWith(2);
  });

  it("disables decrement button when at minimum", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={1} onChange={handleChange} min={1} max={5} />);
    });

    const decBtn = container!.querySelector('button[aria-label="Decrease quantity"]') as HTMLButtonElement;
    expect(decBtn.disabled).toBe(true);
    await act(async () => {
      decBtn.click();
    });
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("disables increment button when at maximum", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={5} onChange={handleChange} min={1} max={5} />);
    });

    const incBtn = container!.querySelector('button[aria-label="Increase quantity"]') as HTMLButtonElement;
    expect(incBtn.disabled).toBe(true);
    await act(async () => {
      incBtn.click();
    });
    expect(handleChange).not.toHaveBeenCalled();
  });

  function setInputValue(input: HTMLInputElement, value: string) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("handles direct typing and clamps to max", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={2} onChange={handleChange} min={1} max={10} />);
    });

    const input = container!.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "15");
    });
    expect(handleChange).toHaveBeenCalledWith(10);
  });

  it("clamps zero or negative input to minimum (1)", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={2} onChange={handleChange} min={1} max={10} />);
    });

    const input = container!.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "0");
    });
    expect(handleChange).toHaveBeenCalledWith(1);
  });

  it("handles decimal input by stripping non-digits", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={2} onChange={handleChange} min={1} max={20} />);
    });

    const input = container!.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "2.5");
    });
    // Decimal point is stripped -> "25" -> clamped to max 20
    expect(handleChange).toHaveBeenCalledWith(20);
  });

  it("handles empty input on blur by resetting to min", async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root!.render(<QuantityStepper value={3} onChange={handleChange} min={1} max={10} />);
    });

    const input = container!.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "");
    });
    await act(async () => {
      input.focus();
      input.blur();
    });
    expect(handleChange).toHaveBeenCalledWith(1);
  });
});
