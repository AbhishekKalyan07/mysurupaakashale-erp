## 2024-05-24 - [Cache Intl.DateTimeFormat instances]
**Learning:** Instantiating `Intl.DateTimeFormat` inside rendering loops or frequently called util blocks generates a bottleneck.
**Action:** Use `getCachedDateTimeFormatter` from `src/shared/lib/date.ts` to retrieve an already instantiated formatter for standard application timezones and layouts.
