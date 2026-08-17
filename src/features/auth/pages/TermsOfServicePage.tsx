import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-rice-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-rice-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/login" className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors">
            <ArrowLeft size={16} />
            Back
          </Link>
          <div className="h-5 w-px bg-rice-300" />
          <h1 className="font-display text-lg font-bold text-ink-900">Terms of Service</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white rounded-2xl border border-rice-200 shadow-sm p-6 sm:p-10 space-y-8 text-ink-700 text-[15px] leading-relaxed font-sans">
          
          <div>
            <p className="text-sm text-ink-500 font-medium uppercase tracking-wider mb-1">Last updated</p>
            <p className="text-ink-600 font-semibold">29 July 2026</p>
          </div>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">1. Introduction</h2>
            <p>
              Welcome to <strong>Mysuru Paakashale</strong> ("we", "our", "us"). These Terms of Service ("Terms") govern your 
              use of our web application at <strong>app.mysurupaakashale.in</strong> ("Platform") and our meal subscription 
              delivery services ("Services"). By creating an account or using our Services, you agree to these Terms in their entirety.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">2. Eligibility</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You must be at least 18 years of age to use our Services.</li>
              <li>You must provide accurate and complete information during registration.</li>
              <li>Our delivery services are currently available only within Mysuru, Karnataka, India.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">3. Account Registration</h2>
            <p>
              You may register using your email and password or via Google Sign-In. You are responsible for 
              maintaining the confidentiality of your login credentials. You agree to notify us immediately 
              of any unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">4. Subscription Plans &amp; Billing</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We offer meal subscription plans with <strong>weekly</strong> and <strong>monthly</strong> billing cycles.</li>
              <li>Plans are available in tiers: <strong>Basic</strong>, <strong>Standard</strong>, and <strong>Premium</strong>, each with different meal selections and pricing.</li>
              <li>A <strong>security deposit</strong> may be required at the time of subscription activation. This deposit is refundable upon cancellation, subject to deductions for outstanding dues or damages.</li>
              <li>Prices displayed on the Platform are in Indian Rupees (₹ INR) and are inclusive of applicable taxes unless stated otherwise.</li>
              <li>We reserve the right to revise subscription pricing with reasonable advance notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">5. Payments</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We accept payments via <strong>UPI</strong>, <strong>bank transfer (NEFT/IMPS)</strong>, and <strong>cash</strong>.</li>
              <li>Payments are submitted through the Platform and require <strong>admin verification</strong> before your subscription is activated.</li>
              <li>You may upload a payment screenshot as proof of transfer. Payment verification typically completes within 24–48 hours.</li>
              <li>Subscriptions set to <strong>auto-renew</strong> will continue at the end of each billing cycle unless you cancel or pause before the cycle ends.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">6. Meal Delivery</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Meals are delivered daily to your registered delivery address for the meals you have subscribed to (breakfast, lunch, and/or dinner).</li>
              <li>Delivery times are approximate and may vary based on route optimization and weather conditions.</li>
              <li><strong>Sundays are non-delivery days.</strong> No meals are prepared or delivered on Sundays, and they are excluded from billing calculations.</li>
              <li>We are not liable for delays caused by events beyond our reasonable control (traffic, natural disasters, public emergencies, etc.).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">7. Skips, Pauses &amp; Cancellations</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Skips:</strong> You may skip individual meals for specific dates. You will only be billed for meals that are actually delivered to you.</li>
              <li><strong>Pauses:</strong> You may pause your subscription for a specified duration. No orders will be generated or billed during the pause period.</li>
              <li><strong>Cancellations:</strong> You may cancel your subscription at any time. Already-delivered meals are non-refundable. Final settlements will be calculated based on your exact deliveries.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">8. Refund Policy</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Refunds for rejected payments or duplicate submissions will be processed within 7–10 business days.</li>
              <li>You will only be billed for the meals that are not cancelled or skipped before our cut-off times.</li>
              <li>Security deposits are refundable upon subscription cancellation, less any outstanding dues.</li>
              <li>No refunds are provided for meals already prepared and delivered, or for missed deliveries due to incorrect address or customer unavailability.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">9. Food Safety &amp; Allergies</h2>
            <p>
              We follow standard food safety and hygiene practices in our kitchen. However, our meals may contain 
              common allergens including <strong>nuts, dairy, gluten, soy, and mustard</strong>. If you have specific 
              dietary restrictions or severe allergies, please contact us before subscribing. We do our best to 
              accommodate preferences, but <strong>we cannot guarantee an allergen-free environment</strong>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">10. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Use the Platform for any fraudulent, abusive, or unlawful purpose.</li>
              <li>Submit false payment proofs or manipulate payment records.</li>
              <li>Share your account credentials with others or allow unauthorized access.</li>
              <li>Interfere with the Platform's functionality or attempt to access data belonging to other users.</li>
            </ul>
            <p className="mt-2">
              We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">11. Intellectual Property</h2>
            <p>
              All content on the Platform — including text, graphics, logos, recipes, UI design, and software — 
              is the property of Mysuru Paakashale and is protected under applicable intellectual property laws. 
              You may not reproduce, distribute, or create derivative works from any Platform content without 
              our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">12. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Mysuru Paakashale shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages arising out of or related to your use of 
              the Services. Our total liability shall not exceed the amount paid by you for the current billing cycle.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">13. Modifications to Terms</h2>
            <p>
              We may update these Terms from time to time. Changes will be posted on this page with an updated 
              "Last updated" date. Your continued use of the Platform after changes constitutes acceptance of 
              the revised Terms. For material changes, we will notify you via the Platform or email.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">14. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of <strong>India</strong>. 
              Any disputes arising from these Terms or your use of the Services shall be subject to the exclusive 
              jurisdiction of the courts in <strong>Mysuru, Karnataka, India</strong>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">15. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please reach out to us:
            </p>
            <div className="mt-3 bg-rice-50 border border-rice-200 rounded-xl p-4 space-y-1 text-sm">
              <p><strong>Mysuru Paakashale</strong></p>
              <p>Mysuru, Karnataka, India</p>
              <p>Email: <a href="mailto:support@mysurupaakashale.in" className="text-leaf-700 font-medium hover:underline">support@mysurupaakashale.in</a></p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
