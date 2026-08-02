import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPolicyPage() {
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
          <h1 className="font-display text-lg font-bold text-ink-900">Privacy Policy</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white rounded-2xl border border-rice-200 shadow-sm p-6 sm:p-10 space-y-8 text-ink-700 text-[15px] leading-relaxed font-sans">
          
          <div>
            <p className="text-sm text-ink-600 font-medium tracking-wider mb-1"><strong>Effective Date:</strong> 29 July 2026</p>
            <p className="text-sm text-ink-600 font-medium tracking-wider mb-1"><strong>Last Updated:</strong> 29 July 2026</p>
          </div>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">1. Introduction</h2>
            <p>
              <strong>Mysuru Paakashale</strong> ("we", "our", "us") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, store, and protect your personal information 
              when you use our web application at <strong>app.mysurupaakashale.in</strong> ("Platform") and 
              our meal subscription delivery services ("Services").
            </p>
            <p className="mt-2">
              By using our Platform, you consent to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">2. Information We Collect</h2>
            
            <h3 className="font-semibold text-ink-800 mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Account details:</strong> Full name, email address, phone number. If you choose to sign in using Google, we may receive your name, email address, profile picture, and Google account identifier as permitted by your Google account settings.</li>
              <li><strong>Delivery addresses:</strong> Street address, landmark, area, and pincode for meal delivery.</li>
              <li><strong>Payment information:</strong> Payment method (UPI/bank transfer/cash), Payment reference details, transaction IDs, payment screenshots, payment date and payment amount submitted for manual verification. We do not collect or store your UPI PIN, banking passwords, debit/credit card numbers, CVV, or OTPs.</li>
              <li><strong>Meal preferences:</strong> Selected meal types (breakfast, lunch, dinner) and subscription tier preferences.</li>
              <li><strong>Communication:</strong> Any messages, feedback, or support requests you send us.</li>
            </ul>

            <h3 className="font-semibold text-ink-800 mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Device &amp; browser info:</strong> Browser type, operating system, and device type for optimizing your experience.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, and interaction patterns (via Firebase Analytics).</li>
              <li><strong>Performance data:</strong> Page load times and error reports (via Firebase Performance Monitoring).</li>
              <li><strong>Network status:</strong> Online/offline status to manage cached data and sync.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Deliver your meals:</strong> Process your subscription, generate daily orders, and coordinate delivery to your address.</li>
              <li><strong>Process payments:</strong> Verify manual payments, generate invoices, and maintain billing records.</li>
              <li><strong>Communicate with you:</strong> Send order confirmations, delivery updates, payment receipts, subscription reminders, and important service announcements via in-app notifications and email.</li>
              <li><strong>Improve our services:</strong> Analyse usage patterns, optimize delivery routes, improve the menu, and enhance the overall user experience.</li>
              <li><strong>Ensure security:</strong> Detect and prevent fraudulent activity, enforce our Terms of Service, and protect user accounts.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">4. Legal Basis for Processing</h2>
            <p>We process your personal information:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>to provide the Services you request;</li>
              <li>to fulfil our contractual obligations;</li>
              <li>to comply with legal and regulatory requirements;</li>
              <li>based on your consent where required; and</li>
              <li>for our legitimate business interests, provided such interests do not override your rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">5. Data Storage &amp; Security</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your data is stored securely on <strong>Google Firebase</strong> (Cloud Firestore, Firebase Authentication, and Firebase Storage), hosted on Google Cloud Platform infrastructure.</li>
              <li>Authentication is managed via <strong>Firebase Authentication</strong> with support for email/password and Google OAuth 2.0 sign-in.</li>
              <li>Payment screenshots are stored in <strong>Firebase Storage</strong> with access restricted by security rules to the uploading customer and authorized administrators.</li>
              <li>All data transmission is encrypted using <strong>TLS/SSL</strong>.</li>
              <li>Firestore security rules enforce strict access control — users can only read and modify their own data; administrative actions are gated to verified admin accounts.</li>
              <li>We use <strong>IndexedDB persistence</strong> for offline access so you can view your subscription and order history even without an internet connection. This cached data resides on your device.</li>
            </ul>
            <p className="mt-4">
              While we implement reasonable administrative, technical, and physical safeguards to protect your personal information, no method of transmission over the Internet or electronic storage is completely secure. Therefore, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">6. Data Sharing</h2>
            <p>We do <strong>not sell, rent, or trade</strong> your personal information to third parties. We may share your data only in these limited circumstances:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Delivery partners:</strong> Your name, delivery address, and order details are shared with our delivery staff solely to fulfil your meal deliveries.</li>
              <li><strong>Service providers:</strong> We use Firebase (Google) for hosting, authentication, and data storage; and EmailJS for transactional emails (invoices, notifications). These providers process data on our behalf under their own privacy policies.</li>
              <li><strong>Legal requirements:</strong> We may disclose your information if required by law, court order, or to protect the rights, property, or safety of Mysuru Paakashale, our users, or the public.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">7. Third-Party Services</h2>
            <p>
              Our Platform may contain links to third-party websites or services. We are not responsible for their privacy practices. We encourage you to review the privacy policies of any third-party websites you visit.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">8. Cookies &amp; Local Storage</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We use <strong>Firebase Authentication tokens</strong> stored in your browser's local storage to keep you signed in across sessions.</li>
              <li><strong>IndexedDB</strong> is used for offline data caching (Firestore persistent cache).</li>
              <li><strong>Local storage</strong> is used for UI preferences (e.g., sidebar collapsed state).</li>
              <li>We use <strong>Firebase Analytics</strong> (powered by Google Analytics) which may set cookies for usage analysis. You may disable cookies through your browser settings; however, certain features such as authentication and offline functionality may not operate correctly.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">9. International Data Transfers</h2>
            <p>
              Some of your personal information may be processed or stored on servers located outside India by our trusted service providers, including Google Firebase. We ensure that such transfers are subject to appropriate safeguards and applicable legal requirements.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">10. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Account data:</strong> Retained as long as your account is active. If you request account deletion, we will remove your personal data within 30 days, except where retention is required for legal or legitimate business purposes (e.g., financial records).</li>
              <li><strong>Order &amp; payment records:</strong> Retained for a minimum of 3 years for accounting, tax compliance, and dispute resolution purposes.</li>
              <li><strong>Analytics &amp; audit logs:</strong> Automatically purged after 90 days.</li>
              <li><strong>Payment screenshots:</strong> Retained for 6 months after payment verification, then deleted.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">11. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information via your Profile page or by contacting us.</li>
              <li><strong>Deletion:</strong> Request deletion of your account and associated personal data, subject to retention obligations.</li>
              <li><strong>Data portability:</strong> Request your data in a structured, machine-readable format.</li>
              <li><strong>Withdraw consent:</strong> Right to withdraw consent for optional data processing (e.g., analytics) at any time.</li>
              <li><strong>Lodge a complaint:</strong> Right to lodge a complaint with the relevant data protection authority.</li>
              <li><strong>Restriction of processing:</strong> Right to request restriction of processing (where applicable).</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:support@mysurupaakashale.in" className="text-leaf-700 font-medium hover:underline">support@mysurupaakashale.in</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">12. Children's Privacy</h2>
            <p>
              Our Services are not intended for individuals under the age of 18. We do not knowingly collect 
              personal information from children. If we discover that a child under 18 has created an account, 
              we will promptly delete the account and associated data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an 
              updated "Last updated" date. For significant changes, we will notify you via the Platform or email. 
              Your continued use of the Services after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">14. Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or how we handle your data, please contact us:
            </p>
            <div className="mt-3 bg-rice-50 border border-rice-200 rounded-xl p-4 space-y-1 text-sm">
              <p><strong>Mysuru Paakashale</strong></p>
              <p>Mysuru, Karnataka, India</p>
              <p>Email: <a href="mailto:support@mysurupaakashale.in" className="text-leaf-700 font-medium hover:underline">support@mysurupaakashale.in</a></p>
              <p>Website: <a href="https://app.mysurupaakashale.in" className="text-leaf-700 font-medium hover:underline">https://app.mysurupaakashale.in</a></p>
            </div>
          </section>
          
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-3">15. Governing Law</h2>
            <p>
              This Privacy Policy shall be governed by and construed in accordance with the laws of India. Any disputes arising out of this Policy shall be subject to the exclusive jurisdiction of the courts located in Mysuru, Karnataka.
            </p>
          </section>
          
          <section className="pt-4 border-t border-rice-200">
            <p className="font-semibold text-ink-800 text-center">
              By creating an account or using our Platform, you acknowledge that you have read, understood, and agreed to this Privacy Policy.
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
