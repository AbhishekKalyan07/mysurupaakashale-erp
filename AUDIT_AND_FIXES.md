# Audit & Fixes — Mysuru Paakashale ERP

Full read-through of the codebase (not just the Subscriptions module), cross-checked
against `firestore.rules`, `storage.rules`, and a real `tsc -b` + `vite build` +
`oxlint` + `npm audit` run. Everything below was verified against the actual code,
not assumed from file names or comments — several existing comments/docs in this
repo turned out to be stale and are called out where relevant.

## 1. The reported Subscriptions bug — verified, with one correction

The original diagnosis was **mostly right**:

- ✅ `AdminSubscriptionsPage.tsx` was a placeholder. **Fixed** — full implementation below.
- ✅ `subscriptionRepository.ts` had no admin methods. **Fixed** — added.
- ⚠️ **Not reproducible as described:** "subscriptions are created with `status: 'pending'`, so the customer hook's `['active','pending_payment']` filter misses them." I checked every place a subscription's `status` is written — `subscriptionService.createSubscription()` correctly uses `'pending_payment'`, matching what `useMySubscription`/`getActiveSubscriptionByCustomerId` query for. `'pending'` only legitimately exists on the *separate* `ManualPayment.status` field (a different collection). There's no live code path that writes `status: 'pending'` onto a subscription document — I didn't change this because there was nothing to change. If you saw this in practice, it'd be worth screenshotting *which* subscription and its exact `status` value.

## 2. Critical security fixes

1. **Removed `elevateToAdmin`** (`functions/src/index.ts`) — a public, unauthenticated HTTP endpoint that granted **full admin rights to any account** given just an email in the URL. Marked "TEMPORARY FOR TESTING" but still present and deployable. This was the most serious finding — if `functions/` was ever deployed, anyone who found the URL could take over the whole ERP.
2. **Closed a free-subscription-activation hole** (`firestore.rules`, `subscriptions/{id}` update rule) — customers could previously write `{ status: 'active' }` to their own subscription directly via the SDK (bypassing the app UI entirely) and get active service with **zero payment**, because the rule only checked *which* field changed, not what it changed to. Now restricted to the exact transitions the app actually offers (pause↔resume, →cancelled, cancelled/expired→pending_payment). Admin access is unaffected.
3. **Fixed the "Renew" button** (`SubscriptionDetailsPage.tsx`) to match #2 — it used to send a lapsed/cancelled subscription straight to `'active'` with no new payment step. It now goes to `'pending_payment'`, same as a brand-new subscription, and the existing "submit payment" banner picks it up automatically.
4. **Tightened the `notifications` create rule** — any signed-in customer could previously create a notification with any `recipientId`/`type`/message, i.e. spam or impersonate a system notification to any other user. Now limited to a specific allow-list of customer-triggered types, truthfully attributed, and only to an actual admin recipient.
5. **Fixed `storage.rules`** — the `meal-plan-images` write rule and `delivery-proof` read rule checked `request.auth.token.role`, a Firebase Auth **custom claim**. Nothing in this app's real architecture sets that claim anymore (roles live in Firestore — see the "Phase 3" comments already in the code); so in practice **no admin could ever upload a meal-plan image, and no admin/kitchen staff could ever view a delivery-proof photo.** Switched both to the same Firestore-role check `isAdmin()`/`isKitchen()` the rest of the file already uses.
6. **Leaked credentials** — the uploaded zip contained two stale full-project backup archives (`mysuru-paakashale-erp.zip`, `project_source.zip`) at the repo root, each bundling a captured `.env.local` with real, populated Firebase project config. I removed both from the delivered project. **Action needed on your end:** if these were ever pushed to git, purge them from history (`git filter-repo` or BFG) — Firebase web config isn't secret by design, but the whole point of `.gitignore`-ing `.env.local` is defeated if it's sitting inside a committed zip. Worth a quick look at whether anything else in your real git history has similar leftovers.

## 3. Functional bugs fixed

7. **Three `require()` calls that throw at runtime.** This is a Vite/browser ESM bundle — `require()` doesn't exist there (that's a Node/CommonJS thing). Each of these threw `ReferenceError: require is not defined`:
   - `subscriptionRepository.addSkip()` — broke the customer "skip a meal day" feature completely.
   - `useMySubscription.ts` → `useSkipDay()` — threw on every render wherever the hook was used (likely broke the whole Subscription Details page's skip UI).
   - `paymentService.submitPayment()` — silently swallowed by a `try/catch`, so admins were never notified in-app when a customer submitted a payment.
   
   All three converted to normal top-of-file imports (checked for circular-import risk first — none).

## 4. New: full Admin Subscriptions module

- `subscriptionRepository.ts`: added `getSubscriptionsPaginated()` (cursor-paginated, mirrors `paymentRepository`), `getAllSubscriptions()`, `updateStatus()`.
- `subscriptionService.ts`: added `approveSubscription`, `rejectSubscription`, `pauseSubscription`, `resumeSubscription` — this is the business-service layer the README already documented (`subscriptionService.pauseSubscription()`) but never actually existed until now.
- `notificationService.ts`: added `notifySubscriptionPaused/Resumed/Rejected` (the paused/resumed notification *types* already existed in the type union, just no sender function).
- `useAdminSubscriptions.ts` (new): list + approve/reject/pause/resume hooks, with audit logging and customer notifications on every action, matching how Staff Management / Payment Verification already work.
- `AdminSubscriptionsPage.tsx`: tabs (All / Pending / Active / Paused / Expired / Cancelled), search, a table with Customer, Phone, Plan, Start/End Date, Status, and a detail dialog with contextual Approve/Reject/Pause/Resume actions and a confirm step — same visual language as `PaymentVerificationPage.tsx`.
- `firestore.indexes.json`: added the `(status, createdAt)` composite index this needs.

**Design note:** "Approve" on this page is a direct admin override (for payments confirmed off-platform) — it does *not* replace the existing Payment Verification queue, which remains the primary path (customer submits proof → admin verifies → subscription activates automatically). Both are wired to the same underlying state machine.

## 5. Before this goes live

- [ ] Deploy the updated rules: `firebase deploy --only firestore:rules,storage:rules`
- [ ] Deploy the new index: `firebase deploy --only firestore:indexes` (composite indexes can take a few minutes to build)
- [ ] Rotate/review git history for the leaked `.env.local` copies (see §2.6)
- [ ] Re-deploy `functions/` (or better, retire it — see below) so the `elevateToAdmin` removal actually takes effect if it was ever live

## 6. Found, not fixed — flagging for you to prioritize

- **Four other Admin pages are placeholders too:** `AdminOrdersPage`, `AdminCustomersPage`, and (partially) `AdminKitchenPage`/`AdminAccountsPage` are all the same "under construction" stub as Subscriptions was. The original suggestion assumed these were the working baseline to match — they aren't. Happy to build these out the same way; let me know which to prioritize.
- **`functions/` is dead code that contradicts the documented architecture.** `PRODUCTION_READINESS_REPORT.md` and the README both state this app deliberately avoids Cloud Functions (Spark plan only, GitHub Actions for cron instead — `scripts/automation/`). But `functions/` still exists, requires the paid Blaze plan, and duplicates `generateDailyOrders`/monthly billing logic that's already handled by the GitHub Actions scripts. Recommend deleting the directory entirely once you confirm it's not deployed anywhere.
- **`PaymentVerificationPage.tsx` pagination doesn't actually paginate** — `useAdminPayments(status, page)` takes a `page` number but the query function never passes a cursor, so every page fetches the same first 20 payments. Admins can currently only ever see the 20 most recent payments per status tab. I didn't touch this file (outside the ask), but it's the same shape of bug and worth a fix — happy to do it (I'd switch it to `useInfiniteQuery`, same as the new Subscriptions hook).
- **Payment amount/subscription tampering:** the `payments` create rule doesn't verify the `subscriptionId` a customer submits actually belongs to them, or that `amount` is positive. Low risk in practice since admin manually reviews each one against the screenshot, but worth tightening.
- **Minor auth hardening:** `authService.ts`'s error-message map returns a distinct "No account found with that email" for `auth/user-not-found`, which enables email-enumeration if that code path is ever hit (Firebase's default `invalid-credential` unification is already handled — this is a fallback-path issue only).
- **Dependency vulnerabilities:** ran `npm audit fix` (safe fixes applied — 9→8, cleared the one high-severity issue). The remaining 8 are all moderate, all in dev-only tooling (`firebase-tools`) or `exceljs`'s transitive `uuid`, and only fixable via a breaking major-version downgrade — didn't force that without your sign-off.
- **No test suite exists** — `package.json` has no test runner at all (no Jest/Vitest/Playwright), and `PRODUCTION_READINESS_REPORT.md`'s "rigorously typed... GO LIVE" framing overstates this. What I *could* run — `tsc -b` (0 errors), `oxlint` (0 errors, 3 pre-existing unrelated warnings), `npm run build` (succeeds), `npm audit` — all pass clean after these fixes. Actual test coverage is a separate, sizeable piece of work if you want it.
- **Several stale comments** reference files from an earlier architecture that no longer exist (`functions/src/auth/onUserCreate.ts`, `functions/src/types/shared.types.ts`) — harmless but confusing if you or another AI goes looking for them. Left as-is to keep this diff focused; happy to do a comment-cleanup pass separately.

## 7. On "unhackable"

No app is unhackable — that's not a real state, just a direction to keep moving in. What I can say concretely: the two most severe issues I found (the public admin-elevation endpoint, and the free-subscription-self-activation gap) are closed, the role-check inconsistency in Storage rules is fixed, and the write path is now enforced by the rules file itself. The follow-up list above is the honest next set of things worth tightening.

 
 # #   8 .   P h a s e   2   ( S t a r t u p   P e r f o r m a n c e   &   A d d i t i o n a l   F i x e s ) 
 -   A d d e d   m a s s i v e   t e s t   s u i t e   ( 3 7 9   t e s t s   v i a   V i t e s t )   c o v e r i n g   s e c u r i t y ,   b u s i n e s s   l o g i c ,   a n d   U I . 
 -   A d m i n   d a s h b o a r d   p a g e s   ( O r d e r s ,   C u s t o m e r s ,   K i t c h e n ,   A c c o u n t s )   h a v e   a l l   b e e n   f u l l y   i m p l e m e n t e d . 
 -   * * S t a r t u p   P e r f o r m a n c e   F i x : * *   R e m o v e d   b l o c k i n g   p r o f i l e   l o o k u p   i n   \ A p p S h e l l . t s x \   a n d   a d d e d   a n   o p t i m i s t i c   s y n c h r o n o u s   \ l o c a l S t o r a g e \   c a c h e   i n   \ A u t h C o n t e x t . t s x \ .   T i m e   t o   i n i t i a l   d a s h b o a r d   p a i n t   i s   n o w   ~ 1 . 6 s ,   e l i m i n a t i n g   t h e   p r e v i o u s   1 7 s +   l o a d i n g   s c r e e n   b l o c k   w h i l e   p r e s e r v i n g   a b s o l u t e   F i r e b a s e / F i r e s t o r e   a u t h o r i t y .   D e t a i l e d   m e t r i c s   i n   \ P E R F O R M A N C E _ F I X _ R E P O R T . m d \ . 
  
 