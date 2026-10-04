import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/queryKeys";
import { mealPlanRepository } from "@/shared/services/firestore/mealPlanRepository";
import { where } from "firebase/firestore";

export const STANDARD_PLAN_TIERS = ["basic", "regular"] as const;

/**
 * Filter to determine whether a plan is one of the standard plan options (Basic or Regular).
 * Excludes legacy/redundant duration plans (e.g., Weekly, Monthly Standard, Trial) from standard selectors.
 */
export function isStandardPlan(plan: { tier?: string; id?: string; name?: string }): boolean {
  if (!plan) return false;
  const tier = (plan.tier || "").toLowerCase().trim();
  const id = (plan.id || "").toLowerCase().trim();
  const name = (plan.name || "").toLowerCase().trim();

  // Explicit exclusions for legacy / trial / duration tiers
  if (
    tier.includes("legacy") ||
    id.includes("legacy") ||
    name.includes("legacy") ||
    tier.includes("trial") ||
    name.includes("trial") ||
    tier === "weekly" ||
    tier === "monthly" ||
    name.includes("monthly standard")
  ) {
    return false;
  }

  if (tier === "basic" || tier === "regular" || tier === "standard") return true;
  if (id === "basic-plan" || id === "regular-plan" || id === "plan-1") return true;
  if (
    name === "basic" ||
    name === "regular" ||
    name === "standard" ||
    name.startsWith("basic ") ||
    name.startsWith("regular ") ||
    name.startsWith("standard ")
  ) return true;
  return false;
}

export function useMealPlans() {
  return useQuery({
    queryKey: [...queryKeys.mealPlans.all, "standard"],
    queryFn: async () => {
      const plans = await mealPlanRepository.list(
        where("isActive", "==", true),
      );
      // Only expose Basic and Regular/Standard plans to standard subscription creation/selectors
      return plans
        .filter(isStandardPlan)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    },
  });
}
