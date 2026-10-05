import { useQuery } from "@tanstack/react-query";
import type { FailureQueueRecord } from "@/shared/services/firestore/failureQueueRepository";
import {
  resolveFailureQueueReferences,
  type FailureQueueReferences,
} from "../utils/failureQueueReferenceResolver";

export function useFailureQueueReferences(incidents: FailureQueueRecord[] | undefined) {
  return useQuery<FailureQueueReferences>({
    queryKey: [
      "admin",
      "failureQueueReferences",
      incidents?.map((i) => `${i.customerId}_${i.subscriptionId || ""}`).join(",") || "empty",
    ],
    queryFn: () => resolveFailureQueueReferences(incidents || []),
    enabled: !!incidents && incidents.length > 0,
    staleTime: 5 * 60_000,
  });
}
