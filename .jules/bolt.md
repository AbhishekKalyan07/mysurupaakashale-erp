## 2024-10-02 - Consolidate iterative Array operations on renders
**Learning:** React components often chain multiple `.filter()` and `.map()` calls within their JSX directly, resulting in redundant O(N) traversals per render loop (especially in high-density components like `DeliveryPartnerPage` handling live delivery loops).
**Action:** Consolidate isolated loop aggregations by migrating them to a single O(N) pass inside a `useMemo` block to memoize outputs and drastically minimize array allocations across frequent react re-renders.
