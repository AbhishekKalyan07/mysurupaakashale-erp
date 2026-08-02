# Cost Analysis & Capacity Planning

This document projects Firebase costs across scaling milestones, factoring in our current architecture (Firestore usage, Storage, Hosting, and Auth).

## Current Optimization Baseline
- We rely heavily on `onSnapshot` for real-time order tracking.
- The average user session involves ~25 reads (menu data, user profile, order history).
- Our frontend bundle is served via Firebase Hosting (CDN cached).

## Pricing Breakdown (Firebase Blaze Plan)
- **Firestore Reads**: $0.036 per 100,000 (after 50k free/day)
- **Firestore Writes**: $0.108 per 100,000 (after 20k free/day)
- **Firestore Deletes**: $0.012 per 100,000 (after 20k free/day)
- **Hosting**: $0.015/GB (after 10GB free/mo)
- **Auth**: Phone Auth is $0.01/verification (after 10k free/mo)

---

## Projected Monthly Costs

### Scenario 1: 500 Daily Active Users (DAU)
- **Reads**: 500 users * 25 reads = 12,500/day. (Below 50k free tier)
- **Writes**: 500 users * 2 orders = 1,000/day. (Below 20k free tier)
- **Auth**: < 500 SMS/mo. (Below 10k free tier)
- **Total Estimate**: **$0.00 / month**

### Scenario 2: 2,000 DAU
- **Reads**: 2k users * 25 reads = 50,000/day. (Hovering at free tier limit)
- **Writes**: 4,000/day. (Below free tier)
- **Total Estimate**: **$1.00 - $5.00 / month** (Minor overages on peak days)

### Scenario 3: 5,000 DAU
- **Reads**: 125,000/day = ~3.75M/month. Billable: ~2.2M reads = ~$0.80.
- **Writes**: 10,000/day. (Below free tier)
- **Total Estimate**: **$5.00 - $10.00 / month**

### Scenario 4: 10,000 DAU
- **Reads**: 250,000/day = 7.5M/month. Billable: 6M = $2.16.
- **Writes**: 20,000/day. (Hitting free tier limit)
- **Hosting/Egress**: ~50GB bandwidth = $0.60.
- **Total Estimate**: **$15.00 - $25.00 / month**

### Scenario 5: 25,000 DAU
- **Reads**: 625,000/day = 18.7M/month. Billable: 17.2M = $6.20.
- **Writes**: 50,000/day = 1.5M/month. Billable: 900k = $0.97.
- **Auth**: ~2,000 SMS verifications (New users/re-logins) = Free.
- **Total Estimate**: **$40.00 - $60.00 / month**

---

## Cost Optimization Recommendations (For >10k Users)

1. **Migrate Historical Data off `onSnapshot`**:
   Real-time listeners on the `orders` collection for all historical orders will drain read quotas as users accumulate history. 
   **Fix**: Only use `onSnapshot` for *today's* active orders. Use `getDocs` for historical orders with local state caching.

2. **Implement Data Bundles / Local Caching**:
   Menu configurations (Daily Menu, Meal Plans) rarely change during the day.
   **Fix**: Cache these aggressively using standard HTTP Cache-Control headers or IndexedDB to prevent repetitive reads on every app load.

3. **Batched Writes**:
   The admin dashboard's order-patching logic uses `writeBatch`, which is highly efficient. Ensure this pattern is maintained.
