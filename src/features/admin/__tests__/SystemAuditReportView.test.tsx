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

  describe("Payment Event Rendering", () => {
    it("renders rich payment card with INR currency, method, UTR, purpose, and raw JSON", () => {
      const details = {
        amount: 1500,
        paymentMethod: "upi",
        referenceNumber: "ABC123456789",
        purpose: "monthly_usage",
        customerName: "Abhishek K",
        subscriptionId: "sub-123",
        billingMonth: "September 2026",
      };

      const html = renderToString(
        <SystemAuditReportView details={details} action="payment_received" />,
      );

      expect(html).toContain("PAYMENT RECEIVED");
      expect(html).toContain("₹1,500.00");
      expect(html).toContain("UPI");
      expect(html).toContain("ABC123456789");
      expect(html).toContain("Monthly Usage");
      expect(html).toContain("Abhishek K");
      expect(html).toContain("sub-123");
      expect(html).toContain("September 2026");

      // Expandable raw JSON inspector
      expect(html).toContain("<details");
      expect(html).toContain("View Raw JSON");
      expect(html).toContain("<pre");
    });

    it("renders security deposit payment with bank transfer and utr field", () => {
      const details = {
        amount: 500,
        method: "bank_transfer",
        utr: "UTR987654321",
        purpose: "security_deposit",
      };

      const html = renderToString(
        <SystemAuditReportView details={details} action="payment_submitted" />,
      );

      expect(html).toContain("PAYMENT SUBMITTED");
      expect(html).toContain("₹500.00");
      expect(html).toContain("Bank Transfer");
      expect(html).toContain("UTR987654321");
      expect(html).toContain("Security Deposit");
    });

    it("renders payment rejection with prominent rejection reason", () => {
      const details = {
        amount: 1500,
        paymentMethod: "upi",
        referenceNumber: "INV_REF_999",
        reason: "Payment reference could not be verified.",
      };

      const html = renderToString(
        <SystemAuditReportView details={details} action="payment_rejected" />,
      );

      expect(html).toContain("PAYMENT REJECTED");
      expect(html).toContain("₹1,500.00");
      expect(html).toContain("Reason:");
      expect(html).toContain("Payment reference could not be verified.");
    });
  });

  describe("Delivery Partner Event Rendering", () => {
    it("renders assigned meal, new partner, and previous partner", () => {
      const details = {
        mealType: "breakfast",
        newPartnerName: "Rakshith",
        oldPartnerName: "Suresh",
      };

      const html = renderToString(
        <SystemAuditReportView
          details={details}
          action="delivery_partner_assigned"
        />,
      );

      expect(html).toContain("DELIVERY PARTNER ASSIGNED");
      expect(html).toContain("Breakfast");
      expect(html).toContain("Rakshith");
      expect(html).toContain("Previous Partner:");
      expect(html).toContain("Suresh");
      expect(html).toContain("View Raw JSON");
    });
  });

  describe("Subscription Event Rendering", () => {
    it("renders plan tier, status, pause dates, and reasons", () => {
      const details = {
        planTier: "regular",
        status: "paused",
        pauseStartDate: "2026-10-01",
        pauseEndDate: "2026-10-05",
        reason: "Customer travelling out of city",
      };

      const html = renderToString(
        <SystemAuditReportView
          details={details}
          action="subscription_paused"
        />,
      );

      expect(html).toContain("SUBSCRIPTION PAUSED");
      expect(html).toContain("regular");
      expect(html).toContain("paused");
      expect(html).toContain("2026-10-01");
      expect(html).toContain("2026-10-05");
      expect(html).toContain("Customer travelling out of city");
    });
  });

  describe("Backward Compatibility", () => {
    it("safely handles legacy payment object missing purpose, UTR, customer, invoice", () => {
      const legacyDetails = {
        amount: 1500,
        paymentMethod: "cash",
      };

      const html = renderToString(
        <SystemAuditReportView details={legacyDetails} action="payment_received" />,
      );

      expect(html).toContain("₹1,500.00");
      expect(html).toContain("Cash");
      expect(html).not.toContain("NaN");
      expect(html).toContain("View Raw JSON");
    });

    it("safely handles empty details object with top-level reason", () => {
      const html = renderToString(
        <SystemAuditReportView
          details={{}}
          action="subscription_rejected"
          reason="Deposit not submitted in time"
        />,
      );

      expect(html).toContain("Reason:");
      expect(html).toContain("Deposit not submitted in time");
    });

    it("safely handles completely empty details with no reason", () => {
      const html = renderToString(
        <SystemAuditReportView details={{}} action="subscription_rejected" />,
      );

      expect(html).toContain("No additional details provided.");
    });
  });

  describe("Generic Structured Formatter", () => {
    it("formats camelCase and snake_case keys into readable labels", () => {
      const details = {
        newPartnerId: "np-101",
        subscriptionId: "sub-202",
        billingMonth: "2026-09",
        staffId: "stf-303",
      };

      const html = renderToString(
        <SystemAuditReportView details={details} action="custom_system_event" />,
      );

      expect(html).toContain("New Partner ID:");
      expect(html).toContain("np-101");
      expect(html).toContain("Subscription ID:");
      expect(html).toContain("sub-202");
      expect(html).toContain("Billing Month:");
      expect(html).toContain("2026-09");
      expect(html).toContain("Staff ID:");
      expect(html).toContain("stf-303");
      expect(html).toContain("View Raw JSON");
    });
  });
});
