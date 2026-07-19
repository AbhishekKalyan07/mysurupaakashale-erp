export const APP_CONFIG = {
  timezone: 'Asia/Kolkata',
  currency: {
    code: 'INR',
    locale: 'en-IN',
    symbol: '₹',
  },
  dateFormat: {
    display: 'MMM dd, yyyy', // e.g. Oct 14, 2026
    system: 'en-CA',         // YYYY-MM-DD
  },
  billing: {
    invoicePrefix: 'MP',
  },
  reporting: {
    dailyPrefix: 'report_daily_',
    monthlyPrefix: 'report_monthly_',
  },
  pagination: {
    defaultPageSize: 50,
    maxPageSize: 100,
  }
} as const;
