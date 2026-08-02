# Accessibility (a11y) Audit Report

Target standard: **WCAG 2.2 AA**

## Findings

### Keyboard Navigation & Focus Management
- **Passed**: All interactive elements (`PremiumButton`, `PremiumInput`, standard anchor links) are keyboard-focusable using standard Tab/Shift+Tab navigation.
- **Passed**: The `react-router-dom` handles route transitions without trapping focus.
- **Issue**: Modals (like `ResumeDeliveryModal`) do not fully trap focus. Tabbing can escape the modal overlay and interact with background elements.
  - *Fix Needed*: Implement a focus trap utility (e.g. `focus-trap-react`) for all popovers and modals.

### ARIA Labels & Semantic HTML
- **Passed**: Semantic HTML5 elements (`<nav>`, `<header>`, `<main>`, `<section>`) are used throughout the layouts.
- **Issue**: Icon-only buttons (such as the quick action icons in the admin dashboard `Settings`, `Users`, `ShieldAlert`) lack `aria-label` attributes for screen readers.
  - *Fix Needed*: Append `aria-label="Staff Management"` to the outer wrapper of the action cards.

### Color Contrast
- **Passed**: The primary brand colors (Deep Indigo/Sapphire Blue text on White/Cream backgrounds) exceed the 4.5:1 ratio required for AA contrast.
- **Warning**: Pastel backgrounds with white text (e.g., inside the metric card icons if modified incorrectly) can fail contrast. Currently, the icons use the solid `text-primary` against pastel backgrounds, which safely passes.

### Screen Reader Support
- **Issue**: Form errors (validation failures from Zod) are rendered below inputs but do not use `aria-live="polite"` or `aria-describedby`.
  - *Fix Needed*: Map the `PremiumInput` error message ID to the input's `aria-describedby` property so screen readers announce the validation failure when focus is maintained on the input.
