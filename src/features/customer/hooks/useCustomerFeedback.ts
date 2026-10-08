import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackRepository } from "@/shared/services/firestore/feedbackRepository";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function useCustomerFeedback() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => queryKeys.feedback.byCustomer(firebaseUser?.uid ?? ""),
    [firebaseUser?.uid],
  );

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const unsubscribe = feedbackRepository.subscribeToCustomerFeedback(
      firebaseUser.uid,
      (feedbackList) => {
        queryClient.setQueryData(queryKey, feedbackList);
      },
      (error) => {
        console.error("[useCustomerFeedback] onSnapshot error:", error);
      },
    );
    return unsubscribe;
  }, [firebaseUser?.uid, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => {
      if (!firebaseUser?.uid) return Promise.resolve([]);
      return feedbackRepository.getByCustomerId(firebaseUser.uid);
    },
    enabled: !!firebaseUser?.uid,
    staleTime: 30_000,
  });
}
