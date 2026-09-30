## 2024-09-15 - Caching Intl API Instantiations
**Learning:** Instantiating `Intl.NumberFormat` (and likely other `Intl.*` APIs like `Intl.DateTimeFormat`) is an expensive operation in JavaScript, taking roughly 100x longer per call than using a cached instance (e.g. ~6.8ms vs ~0.06ms for 100k calls). In a React application, calling this frequently inside render loops or loops over data (like mapping lists of orders, invoices, or payments for a dashboard or table) can introduce noticeable main-thread overhead.
**Action:** Always instantiate `Intl.NumberFormat` and `Intl.DateTimeFormat` once outside of functions/components (at module scope) or wrap them in a singleton pattern, and reuse the instance for formatting.

## 2026-09-30 - [Performance] Cache Intl.DateTimeFormat Instantiations
**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation in JavaScript, especially when done repeatedly within render loops or iteration functions (like formatting multiple dates in a dashboard or table).
**Action:** Use a caching utility like `getCachedDateTimeFormatter` to reuse formatter instances across the application, preventing main-thread blocking and improving overall responsiveness.
