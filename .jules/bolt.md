## 2024-09-15 - Caching Intl API Instantiations
**Learning:** Instantiating `Intl.NumberFormat` (and likely other `Intl.*` APIs like `Intl.DateTimeFormat`) is an expensive operation in JavaScript, taking roughly 100x longer per call than using a cached instance (e.g. ~6.8ms vs ~0.06ms for 100k calls). In a React application, calling this frequently inside render loops or loops over data (like mapping lists of orders, invoices, or payments for a dashboard or table) can introduce noticeable main-thread overhead.
**Action:** Always instantiate `Intl.NumberFormat` and `Intl.DateTimeFormat` once outside of functions/components (at module scope) or wrap them in a singleton pattern, and reuse the instance for formatting.
## 2023-10-24 - Intl.DateTimeFormat Caching
**Learning:** Similar to `Intl.NumberFormat`, directly instantiating `Intl.DateTimeFormat` within render loops or frequently called utility functions introduces unnecessary main-thread overhead.
**Action:** Always use the `getCachedDateTimeFormatter` utility from `src/shared/lib/date.ts` instead of `new Intl.DateTimeFormat`.
