import { useEffect, useState, useCallback } from "react";
import {
  orderDiagnosticService,
  type OrderDiagnosticResult,
} from "@/shared/services/business/orderDiagnosticService";

export function useOrderAutoChecker(
  date: string,
  existingOrdersCount: number,
  isInitialLoading: boolean,
) {
  const [diagnosticResult, setDiagnosticResult] =
    useState<OrderDiagnosticResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await orderDiagnosticService.diagnose(date);
      setDiagnosticResult(res);
      return res;
    } catch (err) {
      console.error("[useOrderAutoChecker] Failed to run diagnostic check:", err);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [date]);

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

    // Strictly read-only diagnosis: never mutates orders or database state upon date viewing
    orderDiagnosticService
      .diagnose(date)
      .then((res) => {
        if (!isMounted) return;
        setDiagnosticResult(res);
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
  }, [date, existingOrdersCount, isInitialLoading]);

  return {
    diagnosticResult,
    isChecking,
    recheck: runCheck,
  };
}
