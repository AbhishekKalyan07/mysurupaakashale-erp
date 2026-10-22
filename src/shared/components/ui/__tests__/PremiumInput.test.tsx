import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useState, act } from "react";
import { createRoot } from "react-dom/client";
import { PremiumInput } from "../PremiumInput";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("PremiumInput Accessibility & Dynamic Validation", () => {
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

  it("renders with aria-invalid=false and no error element by default", async () => {
    await act(async () => {
      root.render(<PremiumInput label="Customer Name" id="name-input" />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("links helper text via aria-describedby when provided without error", async () => {
    await act(async () => {
      root.render(
        <PremiumInput
          label="Phone Number"
          id="phone-input"
          helperText="Enter 10-digit mobile number"
        />,
      );
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("phone-input-helper");

    const helper = container.querySelector("#phone-input-helper");
    expect(helper).not.toBeNull();
    expect(helper?.textContent).toBe("Enter 10-digit mobile number");
  });

  it("renders validation error with role='alert', aria-live='polite', and aria-describedby", async () => {
    await act(async () => {
      root.render(
        <PremiumInput
          label="Email Address"
          id="email-input"
          error="Please enter a valid email address."
        />,
      );
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("email-input-error");

    const errorEl = container.querySelector("#email-input-error") as HTMLParagraphElement;
    expect(errorEl).not.toBeNull();
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.getAttribute("aria-live")).toBe("polite");
    expect(errorEl.textContent).toContain("Please enter a valid email address.");
  });

  it("dynamically updates aria-invalid, aria-describedby, and live-region error when validation changes", async () => {
    let setErrorFn: (err?: string) => void = () => {};

    function DynamicForm() {
      const [error, setError] = useState<string | undefined>(undefined);
      setErrorFn = setError;
      return (
        <PremiumInput
          label="UPI ID"
          id="upi-input"
          error={error}
          helperText="Example: name@okhdfcbank"
        />
      );
    }

    await act(async () => {
      root.render(<DynamicForm />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("upi-input-helper");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    // Trigger validation error
    await act(async () => {
      setErrorFn("Invalid UPI ID format");
    });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("upi-input-error");

    const alertEl = container.querySelector('[role="alert"]') as HTMLParagraphElement;
    expect(alertEl).not.toBeNull();
    expect(alertEl.id).toBe("upi-input-error");
    expect(alertEl.getAttribute("aria-live")).toBe("polite");
    expect(alertEl.textContent).toContain("Invalid UPI ID format");

    // Clear validation error
    await act(async () => {
      setErrorFn(undefined);
    });

    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("upi-input-helper");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
