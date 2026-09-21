import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  orderDiagnosticService,
  type OrderDiagnosticResult,
} from "@/shared/services/business/orderDiagnosticService";
import { queryKeys } from "@/shared/lib/queryKeys";

export function useOrderAutoChecker(
  date: string,
  existingOrdersCount: number,
  isInitialLoading: boolean,
) {
  const queryClient = useQueryClient();
  const [diagnosticResult, setDiagnosticResult] =
    useState<OrderDiagnosticResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await orderDiagnosticService.diagnoseAndRemediate(date);
      setDiagnosticResult(res);
      if (res.autoHealedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["admin", "orders", date] });
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
        queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
        queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      }
      return res;
    } catch (err) {
      console.error("[useOrderAutoChecker] Failed to run diagnostic check:", err);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [date, queryClient]);

  // Reset diagnostic result when switching dates
  useEffect(() => {
    setDiagnosticResult(null);
  }, [date]);

  useEffect(() => {
    if (isInitialLoading) return;
    if (existingOrdersCount > 0) {
      return;
    }

    let isMounted = true;
    setIsChecking(true);

    orderDiagnosticService
      .diagnoseAndRemediate(date)
      .then((res) => {
        if (!isMounted) return;
        setDiagnosticResult(res);
        if (res.autoHealedCount > 0) {
          queryClient.invalidateQueries({ queryKey: ["admin", "orders", date] });
          queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
          queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
          queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
        }
      })
      .catch((err) => {
        console.error("[useOrderAutoChecker] Background check failed:", err);
      })
      .finally(() => {
        if (isMounted) setIsChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, [date, existingOrdersCount, isInitialLoading, queryClient]);

  return {
    diagnosticResult,
    isChecking,
    recheck: runCheck,
  };
}
