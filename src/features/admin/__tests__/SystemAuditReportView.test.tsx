import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SystemAuditReportView } from "../components/SystemAuditReportView";

describe("SystemAuditReportView", () => {
  it("should render normal logs as raw JSON", () => {
    const details = { message: "Normal audit log", action: "user_created" };
    const html = renderToString(<SystemAuditReportView details={details} />);

    // Normal details are stringified in a <pre> tag
    expect(html).toContain("Normal audit log");
    expect(html).toContain("<pre");
  });

  it("should completely suppress raw dumps and render clean UI without raw text", () => {
    const rawDump = `
      stdout | src/shared/services/business/__tests__/orderService.test.ts > orderService
      ✓ generateDailyOrders
      ✓ cancelOrders
      ✗ syncCustomerActiveOrders
      
      # Summary
      Automated system audit completed with warnings.
      
      # Checks Performed
      * Database integrity
      * Payment sync
      
      # Issues Found
      * syncCustomerActiveOrders failed due to timeout
      
      # Recommendations
      * Check network connectivity to Firestore
    `;

    const rawHtml = renderToString(
      <SystemAuditReportView details={{ scriptOutput: rawDump }} />,
    );
    const html = rawHtml.replace(/<!-- -->/g, "");

    // It should not render the raw script tags
    expect(html).not.toContain("stdout |");
    expect(html).not.toContain("generateDailyOrders"); // Specific test name is omitted
    expect(html).not.toContain("<pre"); // Dump should not use pre block

    // It should contain the structured UI
    expect(html).toContain("System Audit Report");
    expect(html).toContain("Automated system audit completed with warnings.");
    expect(html).toContain("Database integrity");
    expect(html).toContain("Payment sync");
    expect(html).toContain("syncCustomerActiveOrders failed due to timeout");
    expect(html).toContain("Check network connectivity to Firestore");

    // Tests are formatted as counts
    expect(html).toContain("2/3 tests passed");
  });

  it('should display "Not available" when arrays are empty', () => {
    const rawDump = `
      system_generated test automation
      ✓ one
      ✓ two
    `;

    const rawHtml = renderToString(<SystemAuditReportView details={rawDump} />);
    const html = rawHtml.replace(/<!-- -->/g, "");

    expect(html).toContain("System Audit Report");
    expect(html).toContain("2/2 tests passed");

    // Fallbacks
    expect(html).toContain("Not available"); // Checks Performed
    expect(html).toContain("None"); // Issues Found
    expect(html).toContain("No immediate action required"); // Recommendations
  });
});
