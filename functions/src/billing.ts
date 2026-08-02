import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Scheduled Cron Job to generate monthly invoices for all active subscriptions.
 * Triggers at 00:00 on the 1st of every month.
 */
export const generateMonthlyInvoices = functions.pubsub.schedule('0 0 1 * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (_context) => {
    const db = admin.firestore();
    console.log('Starting monthly invoice generation...');
    
    const now = new Date();
    // Get the previous month and year
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();
    const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    
    const monthStartStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const monthEndStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

    console.log(`Generating invoices for ${monthStartStr} to ${monthEndStr}`);

    // Fetch all active or paused subscriptions
    const subscriptionsSnap = await db.collection('subscriptions')
      .where('status', 'in', ['active', 'paused'])
      .get();
      
    let generatedCount = 0;
    const batch = db.batch();

    for (const doc of subscriptionsSnap.docs) {
      const sub = doc.data();
      
      // Calculate how many days in the previous month this subscription was active
      const subStartDateStr = sub.startDate;
      
      // If the subscription started after the previous month ended, skip it
      if (subStartDateStr > monthEndStr) continue;

      // Determine the billing start date for this month
      const billingStartDateStr = subStartDateStr > monthStartStr ? subStartDateStr : monthStartStr;
      
      // Calculate total days
      const billingStartDate = new Date(billingStartDateStr);
      const billingEndDate = new Date(monthEndStr);
      const timeDiff = billingEndDate.getTime() - billingStartDate.getTime();
      const daysActive = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

      if (daysActive <= 0) continue;

      const baseCost = daysActive * sub.pricePerDaySnapshot * (sub.quantity || 1);
      const creditBalance = sub.creditBalance || 0;
      
      let finalCost = baseCost - creditBalance;
      let newCreditBalance = 0;
      
      if (finalCost < 0) {
        newCreditBalance = Math.abs(finalCost);
        finalCost = 0;
      }

      if (finalCost > 0) {
        // Generate a pending payment
        const paymentRef = db.collection('payments').doc();
        batch.set(paymentRef, {
          id: paymentRef.id,
          subscriptionId: doc.id,
          customerId: sub.customerId,
          customerName: 'Customer', // We should theoretically fetch the user, but for now we'll rely on customerId
          amount: finalCost,
          currency: 'INR',
          status: 'pending',
          paymentMethod: 'cash', // Default placeholder until they upload receipt
          referenceNumber: '',
          paymentDate: null,
          billingMonth: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`,
          invoiceUrl: null,
          verifiedBy: null,
          verifiedAt: null,
          notes: `Pro-rata billing for ${daysActive} days. Base: ₹${baseCost}, Credit Applied: ₹${creditBalance}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update the subscription credit balance and status to pending_payment
        batch.update(db.collection('subscriptions').doc(doc.id), {
          creditBalance: newCreditBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        generatedCount++;
      }
    }

    await batch.commit();

    console.log(`Successfully generated ${generatedCount} invoices.`);
  });
