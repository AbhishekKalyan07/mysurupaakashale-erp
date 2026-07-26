# Mysuru Paakashale ERP - Deployment Documentation

This document contains everything required for a developer to deploy the Mysuru Paakashale ERP MVP to a fresh production environment from scratch.

---

## 1. Project Architecture Overview

The Mysuru Paakashale ERP is a modern, serverless web application built for scale and reliability:
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, TanStack React Query, React Hook Form + Zod.
- **Backend / BaaS**: Firebase (Authentication, Firestore Database, Cloud Storage).
- **Compute**: Firebase Cloud Functions (v2) running Node.js 22 for all business logic, scheduled tasks, and webhook handling.
- **Payments**: Razorpay (integrated via Cloud Functions to prevent client-side tampering).

---

## 2. Folder Structure

```text
├── .firebase/             # Firebase local build cache
├── functions/             # Firebase Cloud Functions (Backend)
│   ├── src/
│   │   ├── accounts/      # Invoicing & Reports (generateDailyReport, etc.)
│   │   ├── auth/          # RBAC & User Creation (createStaffUser, onUserCreate)
│   │   ├── delivery/      # Dispatch & Workflows
│   │   ├── kitchen/       # Daily Menu & Order Generation (generateDailyOrders)
│   │   ├── subscription/  # Subscription lifecycle & Razorpay Webhooks
│   │   ├── lib/           # Shared backend utilities (admin, logger, withLogger)
│   │   └── types/         # Shared backend types
├── src/                   # Frontend React Application
│   ├── app/               # Core routing, AuthProvider, ErrorBoundary
│   ├── features/          # Feature-sliced domains (auth, customer, delivery, kitchen, accounts)
│   ├── shared/            # Shared components (ui, feedback) and config (appConfig.ts)
│   └── assets/            # Static assets
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Firestore composite index definitions
├── firebase.json          # Firebase deployment configuration
└── package.json           # Frontend dependencies and scripts
```

---

## 3. Firebase Setup

1. Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Email/Password).
3. Enable **Firestore Database** (Start in production mode).
4. Enable **Cloud Functions** (Requires upgrading to the Blaze pay-as-you-go billing plan).
5. Enable **Firebase Hosting**.
6. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
7. Login and link the project:
   ```bash
   firebase login
   firebase use --add
   ```

---

## 4. Firestore Collections

The ERP relies on the following root collections:
- `users`: Stores all customer, admin, kitchen, and delivery profiles.
- `subscriptions`: Active and historical meal plan subscriptions.
- `orders`: Daily generated operational units (read by Kitchen & Dispatch).
- `daily_menus`: Menus published by the Kitchen.
- `payments`: Razorpay transaction records.
- `invoices`: System-generated billing records.
- `audit_logs`: Immutable logs of sensitive operational actions.
- `orderGenerationRuns`: Sentinel locks ensuring idempotency of the daily scheduler.

---

## 5. Firestore Indexes

Complex queries (e.g., Accounts filtering by date and sorting) require composite indexes.
Deploy the predefined indexes using the CLI:
```bash
firebase deploy --only firestore:indexes
```

---

## 6. Firestore Security Rules

The application uses a "deny-by-default" security posture. Only backend Cloud Functions can perform wide-reaching writes.
Deploy the security rules:
```bash
firebase deploy --only firestore:rules
```

---

## 7. Cloud Functions

Cloud Functions encapsulate all business logic (generating orders, verifying payments, assigning drivers).
1. Navigate to the functions directory:
   ```bash
   cd functions
   npm install
   ```
2. Build and deploy:
   ```bash
   npm run build
   firebase deploy --only functions
   ```
*Note: We deploy to `asia-south1` (Mumbai) for minimum latency.*

---

## 8. Environment Variables

The frontend requires Firebase project keys to initialize the SDK.
Create a `.env` file in the root directory:
```env
VITE_FIREBASE_API_KEY="your_api_key"
VITE_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"
```

---

## 9. Secret Manager Configuration

Never hardcode Razorpay keys. Use Firebase Secret Manager (backed by Google Cloud Secret Manager).
Set the secrets using the CLI:
```bash
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
```
*Cloud Functions are configured to automatically inject these at runtime.*

---

## 10. Razorpay Configuration

1. Log into your [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Webhooks**.
3. Add a new webhook pointing to your deployed Cloud Function URL for `razorpayWebhook`.
   - URL: `https://asia-south1-<your_project_id>.cloudfunctions.net/razorpayWebhook`
   - Events to track: `payment.captured`, `payment.failed`.
4. Ensure the webhook secret matches the validation logic in the Cloud Function if implemented.

---

## 11. Firebase Hosting Deployment

To deploy the frontend React application:
1. Build the production assets:
   ```bash
   npm run build
   ```
2. Deploy to hosting:
   ```bash
   firebase deploy --only hosting
   ```

---

## 12. Domain Setup

1. Go to the Firebase Console -> **Hosting**.
2. Click **Add Custom Domain**.
3. Enter your domain (e.g., `erp.mysurupaakashale.com`).
4. Firebase will provide TXT and A records. Add these to your DNS provider (e.g., Cloudflare, GoDaddy, Route53).

---

## 13. SSL Configuration

SSL certificates are automatically provisioned and renewed by Firebase Hosting via Let's Encrypt. Once DNS propagation is complete, Firebase will finalize the SSL certificate within 1-2 hours. No manual configuration is required.

---

## 14. Cloud Scheduler Setup

The `generateDailyOrders` function operates via Firebase `onSchedule`. 
When you deploy functions (`firebase deploy --only functions`), Firebase automatically creates a Google Cloud Scheduler job under the hood. You do not need to manually configure this in the GCP console unless you wish to pause or manually force-trigger the run.

---

## 15. Pub/Sub Configuration

Firebase `onSchedule` uses Google Cloud Pub/Sub topics to trigger the function. This is entirely managed by Firebase during deployment. Ensure that the **Cloud Pub/Sub API** is enabled in your Google Cloud Console.

---

## 16. Admin User Bootstrap

Because RBAC prevents standard users from accessing the Admin dashboard, you must manually bootstrap the first Admin user:
1. Sign up for an account via the normal frontend flow.
2. Retrieve the `uid` from the Firebase Console (Authentication tab).
3. Use a temporary Node.js script (using `firebase-admin`) to set the custom claim:
   ```javascript
   const admin = require('firebase-admin');
   admin.initializeApp();
   admin.auth().setCustomUserClaims('YOUR_UID_HERE', { role: 'admin' })
     .then(() => console.log('Admin claim set.'));
   ```
4. Sign out and sign back in on the frontend. You can now use the Admin Dashboard to create other Staff/Admin accounts.

---

## 17. Backup Strategy

Firebase does not enable automated Firestore backups by default.
1. Navigate to Google Cloud Console -> **Firestore** -> **Import/Export**.
2. Configure a scheduled export (via a Cloud Function or GCP Scheduled Workflows) to dump the database to a Google Cloud Storage bucket daily.
3. Apply a lifecycle rule to the GCS bucket to delete backups older than 30 days to save costs.

---

## 18. Monitoring Strategy

- **Logs**: All Cloud Functions log via the `logger.ts` wrapper. View them in Google Cloud Console -> **Logs Explorer**.
- **Errors**: Enable **Google Cloud Error Reporting** to automatically group and alert you of unhandled exceptions in Cloud Functions.
- **Frontend Monitoring**: (Future) Integrate Sentry or Firebase Crashlytics for web to catch and trace client-side boundary crashes.

---

## 19. Production Deployment Checklist

- [ ] Firebase project created on Blaze Plan.
- [ ] Authentication, Firestore, and Hosting enabled.
- [ ] Local `.env` populated with Firebase config.
- [ ] Firestore Indexes deployed (`firebase deploy --only firestore:indexes`).
- [ ] Firestore Rules deployed (`firebase deploy --only firestore:rules`).
- [ ] Secrets injected (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- [ ] Razorpay Webhook URL registered in Razorpay Dashboard.
- [ ] Cloud Functions deployed (`cd functions && npm run build && firebase deploy --only functions`).
- [ ] Frontend built and deployed (`npm run build && firebase deploy --only hosting`).
- [ ] Custom Domain mapped and SSL verified.
- [ ] Initial Admin User bootstrapped.

---

## 20. Rollback Procedure

**Frontend Rollback**:
1. Open the Firebase Console -> **Hosting**.
2. Locate the previous successful deployment in the Release History.
3. Click the three dots (⋮) and select **Rollback**.

**Backend Rollback**:
1. Check out the previous stable git commit locally: `git checkout <commit_hash>`.
2. Re-deploy the functions: `cd functions && npm run build && firebase deploy --only functions`.

---

## 21. Disaster Recovery Procedure

In the event of complete data corruption or accidental deletion:
1. Locate the most recent stable daily backup in your Google Cloud Storage backup bucket.
2. Use the `gcloud` CLI to initiate a managed import:
   ```bash
   gcloud firestore import gs://[BUCKET_NAME]/[EXPORT_PREFIX]/
   ```
3. Communicate downtime to users.
4. Manually reconcile any payments made via Razorpay between the backup timestamp and the incident timestamp.

---

## 22. Scalability & Idempotency Notes

### Invoice Generation Scalability
The system uses a transactional singleton counter (`system/invoiceCounter`) to guarantee sequential invoice numbering required by accounting standards. While this guarantees atomicity, it creates a transaction bottleneck at extremely high concurrency (e.g., thousands of simultaneous payment verifications). For our current target scale, the transactional approach is safe. If scale increases significantly, consider a distributed counter or a deferred Pub/Sub worker for invoice generation.

### Scheduled Order Generation Idempotency
The `generateDailyOrders` scheduled function (runs at 02:00 AM IST) is highly robust and fully idempotent. It processes active subscriptions in chunks of 60 within independent transactions.
- **Inner Idempotency**: Before creating an order, the transaction checks if an order document already exists for the given date, mealType, and subscription. Existing orders are safely skipped.
- **Outer Recovery**: The function maintains a sentinel document (`orderGenerationRuns/{date}`). If the function crashes or times out due to Cloud Scheduler limits, the next invocation automatically enters a recovery mode, resuming only the specific chunks that failed.
- **Recovery Procedure**: No manual intervention is needed. Firebase Cloud Scheduler will automatically retry the job up to 3 times based on our retry config, and the function will seamlessly resume from where it left off.
