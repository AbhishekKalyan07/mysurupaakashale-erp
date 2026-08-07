export const NotificationTemplates = {
  SubscriptionApproved: (planTier: string, startDate: string) => ({
    title: 'Subscription Approved!',
    message: `Your ${planTier} meal plan has been approved and is active from ${startDate}. Enjoy your meals!`,
  }),
  DriverAssigned: (driverName: string, mealType: string) => ({
    title: 'Driver Assigned',
    message: `${driverName} will be delivering your ${mealType} today.`,
  }),
  InvoiceGenerated: (amount: number, billingMonth: string) => ({
    title: 'New Invoice Generated',
    message: `Your invoice for ${billingMonth} (₹${amount}) is ready.`,
  }),
  PaymentReminder: (amount: number, dueDate: string) => ({
    title: 'Payment Reminder',
    message: `A payment of ₹${amount} is due on ${dueDate}. Please pay to avoid service interruption.`,
  }),
  PaymentReceived: (amount: number) => ({
    title: 'Payment Received ✓',
    message: `We have received your payment of ₹${amount}. Thank you!`,
  }),
  OrderReady: (mealType: string) => ({
    title: 'Order Ready for Pickup',
    message: `Your ${mealType} is ready and waiting for the delivery partner.`,
  }),
  OrderDelivered: (mealType: string) => ({
    title: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Delivered ✓`,
    message: `Your ${mealType} meal has been delivered. Enjoy!`,
  }),
};
