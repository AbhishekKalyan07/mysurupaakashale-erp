# User Acceptance Testing (UAT) Checklist

## Role: Admin
| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|
| 1. Load Dashboard | All 11 metric cards load and display correct real-time totals. | | | |
| 2. Re-assign Order | Dragging an unassigned order to a delivery partner patches the order and updates UI. | | | |
| 3. Create Staff | Submitting the new staff form creates a user doc with the correct role (e.g. `kitchen`). | | | |

## Role: Kitchen
| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|
| 1. View Production | Target counts exactly match active subscriptions + pending custom orders. | | | |
| 2. Mark Prepared | Clicking "Mark Ready" on an order moves it to `ready_for_pickup`. | | | |

## Role: Delivery
| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|
| 1. Accept Batch | Clicking "Accept All" assigns the `deliveryPartnerId` to all pending orders in zone. | | | |
| 2. Mark Delivered | Swiping/Clicking "Delivered" updates the status and triggers a customer push notification. | | | |
| 3. Fail Delivery | Failing a delivery prompts for a reason and updates the Admin dashboard instantly. | | | |

## Role: Accounts
| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|
| 1. Export Payroll | Clicking export generates a valid CSV of staff attendance/payroll. | | | |
| 2. Reconcile Payment | Manually marking a failed Razorpay order as "Paid via Cash" completes the order. | | | |

## Role: Customer
| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|
| 1. Buy Subscription | Submitting the payment form successfully provisions a 30-day meal plan. | | | |
| 2. Skip Meal | Toggling a date on the calendar skips the meal and extends the subscription by 1 day. | | | |
| 3. Submit Complaint | Filling the feedback form creates a ticket visible to the Admin. | | | |
