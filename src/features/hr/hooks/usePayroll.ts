import {
  Timestamp,
  serverTimestamp,
  runTransaction,
  doc,
} from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  payrollRepository,
  salaryProfileRepository,
  salaryAdvanceRepository,
} from "@/shared/services/firestore/payrollRepository";
import type {
  PayrollRecord,
  EmployeeSalaryProfile,
  PayrollStatus,
  SalaryAdvance,
} from "@/shared/types";
import { db } from "@/shared/lib/firebase";
import { getAuth } from "firebase/auth";
import { getTodayInTimezone } from "@/shared/lib/date";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { notificationRepository } from "@/shared/services/firestore/notificationRepository";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Query key registry
// ─────────────────────────────────────────────────────────────────────────────

export const queryKeys = {
  payroll: {
    base: ["payroll"] as const,
    byMonth: (month: string) =>
      [...queryKeys.payroll.base, "month", month] as const,
    byStaff: (staffId: string) =>
      [...queryKeys.payroll.base, "staff", staffId] as const,
    profiles: ["salaryProfiles"] as const,
    profile: (staffId: string) =>
      [...queryKeys.payroll.profiles, staffId] as const,
    advances: ["salaryAdvances"] as const,
    pendingAdvances: (staffId: string) =>
      [...queryKeys.payroll.advances, "pending", staffId] as const,
    pendingAdvancesByPeriod: (staffId: string, month: string) =>
      [...queryKeys.payroll.advances, "pending", staffId, month] as const,
    allAdvancesByStaff: (staffId: string) =>
      [...queryKeys.payroll.advances, "all", staffId] as const,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper — get actor identity from Firebase Auth current user
// ─────────────────────────────────────────────────────────────────────────────

function getActorIdentity() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not authenticated");
  const name = user.displayName || "Unknown user";
  // We don't have the role here, but we'll use 'admin' as a safe default
  // (the Firestore rules enforce role, not this string)
  return { uid: user.uid, name };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payroll queries
// ─────────────────────────────────────────────────────────────────────────────

export function usePayrollByMonth(month: string) {
  return useQuery({
    queryKey: queryKeys.payroll.byMonth(month),
    queryFn: () => payrollRepository.getPayrollByMonth(month),
    enabled: !!month,
  });
}

export function usePayrollByStaff(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.byStaff(staffId),
    queryFn: () => payrollRepository.getPayrollByStaff(staffId),
    enabled: !!staffId,
  });
}

export function useSalaryProfile(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.profile(staffId),
    queryFn: () => salaryProfileRepository.getProfile(staffId),
    enabled: !!staffId,
  });
}

/**
 * @deprecated Use usePendingAdvancesByPeriod for payroll payment.
 * This hook may be used for non-payment contexts (e.g. a general "how many advances does this employee have").
 */
export function usePendingAdvances(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.pendingAdvances(staffId),
    queryFn: () => salaryAdvanceRepository.getPendingAdvancesByStaff(staffId),
    enabled: !!staffId,
  });
}

/**
 * Period-scoped pending advances — the ONLY hook to use in PaymentConfirmationModal.
 * Only returns advances that match both staffId AND payrollMonth.
 * Legacy advances (payrollMonth === null) are NOT returned by this query.
 */
export function usePendingAdvancesByPeriod(
  staffId: string | null | undefined,
  payrollMonth: string | null | undefined,
) {
  const enabled = !!staffId && !!payrollMonth;
  return useQuery({
    queryKey: queryKeys.payroll.pendingAdvancesByPeriod(
      staffId ?? "",
      payrollMonth ?? "",
    ),
    queryFn: () =>
      salaryAdvanceRepository.getPendingAdvancesByStaffAndPeriod(
        staffId!,
        payrollMonth!,
      ),
    enabled,
  });
}

/** All advances for a staff member — used by the Salary Advance History page. */
export function useAllAdvancesByStaff(staffId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.payroll.allAdvancesByStaff(staffId ?? ""),
    queryFn: () => salaryAdvanceRepository.getAllAdvancesByStaff(staffId!),
    enabled: !!staffId,
  });
}

/** All advances across all staff for a specific payroll period — for the history page period filter. */
export function useAdvancesByPeriod(payrollMonth: string | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.payroll.advances, "period", payrollMonth ?? ""],
    queryFn: () => salaryAdvanceRepository.getAdvancesByPeriod(payrollMonth!),
    enabled: !!payrollMonth,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary advance mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useAddSalaryAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      staffId: string;
      amount: number;
      date: string;
      /** The payroll period this advance will be deducted from. Required. */
      payrollMonth: string;
      reason: string;
      notes?: string;
    }) => {
      const { uid, name } = getActorIdentity();
      const id = crypto.randomUUID();

      const record: SalaryAdvance = {
        id,
        staffId: data.staffId,
        amount: data.amount,
        date: data.date,
        payrollMonth: data.payrollMonth,
        reason: data.reason,
        notes: data.notes,
        status: "pending",
        payrollId: null,
        createdBy: uid,
        createdByName: name,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      };

      await salaryAdvanceRepository.create(record, id);

      await auditRepository.logAction(
        "salary_advance_created",
        uid,
        "admin",
        name,
        id,
        "salaryAdvance",
        {
          amount: data.amount,
          payrollMonth: data.payrollMonth,
          staffId: data.staffId,
          reason: data.reason,
        },
      );
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.advances,
      });
      toast.success("Salary advance added successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to add salary advance");
    },
  });
}

/** Edit a PENDING advance. deducted/voided advances cannot be edited through normal workflow. */
export function useUpdateSalaryAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      advance,
      updates,
    }: {
      advance: SalaryAdvance;
      updates: Partial<
        Pick<
          SalaryAdvance,
          "amount" | "date" | "payrollMonth" | "reason" | "notes"
        >
      >;
    }) => {
      if (advance.status !== "pending") {
        throw new Error(
          `Cannot edit a ${advance.status} advance. Only pending advances may be edited.`,
        );
      }
      const { uid, name } = getActorIdentity();

      await salaryAdvanceRepository.update(advance.id, {
        ...updates,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "salary_advance_updated",
        uid,
        "admin",
        name,
        advance.id,
        "salaryAdvance",
        {
          previousValue: {
            amount: advance.amount,
            date: advance.date,
            payrollMonth: advance.payrollMonth,
            reason: advance.reason,
            notes: advance.notes,
          },
          newValue: { ...updates },
          staffId: advance.staffId,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.advances,
      });
      toast.success("Advance updated successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update advance");
    },
  });
}

/** Void a PENDING advance. Financial record is never deleted. */
export function useVoidSalaryAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      advance,
      voidReason,
    }: {
      advance: SalaryAdvance;
      voidReason: string;
    }) => {
      if (advance.status === "deducted") {
        throw new Error(
          "A deducted advance cannot be voided through the normal workflow.",
        );
      }
      if (advance.status === "voided") {
        throw new Error("This advance is already voided.");
      }
      if (!voidReason.trim()) {
        throw new Error("A reason is required to void an advance.");
      }

      const { uid, name } = getActorIdentity();

      await salaryAdvanceRepository.update(advance.id, {
        status: "voided",
        voidedAt: serverTimestamp() as unknown as Timestamp,
        voidedBy: uid,
        voidedByName: name,
        voidReason,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "salary_advance_voided",
        uid,
        "admin",
        name,
        advance.id,
        "salaryAdvance",
        {
          reason: voidReason,
          previousStatus: advance.status,
          amount: advance.amount,
          staffId: advance.staffId,
          payrollMonth: advance.payrollMonth,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.advances,
      });
      toast.success("Advance voided");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to void advance");
    },
  });
}

/** Assign a payroll period to a legacy advance (payrollMonth: null → YYYY-MM). */
export function useAssignAdvancePeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      advance,
      payrollMonth,
    }: {
      advance: SalaryAdvance;
      payrollMonth: string;
    }) => {
      if (advance.payrollMonth !== null) {
        throw new Error(
          `This advance already has a payroll period (${advance.payrollMonth}). Use edit to change it.`,
        );
      }
      if (!payrollMonth.match(/^\d{4}-\d{2}$/)) {
        throw new Error("Payroll month must be in YYYY-MM format.");
      }
      if (advance.status !== "pending") {
        throw new Error("Only pending advances can have a period assigned.");
      }

      const { uid, name } = getActorIdentity();

      await salaryAdvanceRepository.update(advance.id, {
        payrollMonth,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "salary_advance_period_assigned",
        uid,
        "admin",
        name,
        advance.id,
        "salaryAdvance",
        {
          previousValue: { payrollMonth: null },
          newValue: { payrollMonth },
          staffId: advance.staffId,
          amount: advance.amount,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.advances,
      });
      toast.success("Payroll period assigned to advance");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to assign payroll period");
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary profile mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useUpdateSalaryProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmployeeSalaryProfile) => {
      const exists = await salaryProfileRepository.getProfile(data.id);
      const { uid, name } = getActorIdentity();

      if (exists) {
        await salaryProfileRepository.update(data.id, {
          ...data,
          updatedAt: serverTimestamp() as unknown as Timestamp,
        });
      } else {
        await salaryProfileRepository.create(
          {
            ...data,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          },
          data.id,
        );
      }

      await auditRepository.logAction(
        exists ? "salary_profile_updated" : "salary_profile_created",
        uid,
        "admin",
        name,
        data.id,
        "salary_profile",
        {
          previousBasicSalary: exists ? exists.basicSalary : null,
          newBasicSalary: data.basicSalary,
          previousOvertimeRate: exists ? exists.overtimeRate : null,
          newOvertimeRate: data.overtimeRate,
        },
      );
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.profiles,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.profile(variables.id),
      });
      toast.success("Salary profile updated");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update salary profile");
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Payroll mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useGeneratePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<
        PayrollRecord,
        "id" | "status" | "createdAt" | "updatedAt" | "paymentDate"
      >,
    ) => {
      const id = crypto.randomUUID();
      const record: PayrollRecord = {
        ...data,
        id,
        status: "draft",
        paymentDate: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      };
      await payrollRepository.create(record, id);

      const { uid, name } = getActorIdentity();
      await auditRepository.logAction(
        "payroll_generated",
        uid,
        "admin",
        name,
        id,
        "payroll",
        {
          month: data.month,
          staffId: data.staffId,
          netSalary: data.netSalary,
        },
      );

      await notificationRepository.createNotification({
        recipientId: data.staffId,
        recipientRole: "staff",
        channel: "in_app",
        title: `Payroll Generated: ${data.month}`,
        message: `Your draft payroll for ${data.month} has been generated.`,
        type: "payroll_generated",
        priority: "normal",
        metadata: { payrollId: id, month: data.month },
      });

      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll generated successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to generate payroll");
    },
  });
}

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<PayrollRecord>;
    }) => {
      await payrollRepository.update(id, {
        ...data,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });
      const { uid, name } = getActorIdentity();
      await auditRepository.logAction(
        "payroll_updated",
        uid,
        "admin",
        name,
        id,
        "payroll",
        {
          updatedKeys: Object.keys(data),
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll updated");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update payroll");
    },
  });
}

/**
 * Simple status update hook — for non-financial status changes only (e.g. draft → review).
 * For rejection/return, use useRejectPayroll / useReturnPayrollToDraft.
 */
export function useUpdatePayrollStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: PayrollStatus;
    }) => {
      // Prevent paid → backward transition through this general hook
      const existing = await payrollRepository.getById(id);
      if (existing?.status === "paid") {
        throw new Error(
          "A paid payroll cannot be changed. Only archival is permitted.",
        );
      }
      if (existing?.status === "archived") {
        throw new Error("An archived payroll cannot be changed.");
      }

      await payrollRepository.update(id, {
        status,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });
      const { uid, name } = getActorIdentity();
      await auditRepository.logAction(
        "payroll_status_changed",
        uid,
        "admin",
        name,
        id,
        "payroll",
        {
          previousStatus: existing?.status,
          newStatus: status,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll status updated");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update payroll status");
    },
  });
}

/** Reject a payroll (review → rejected OR approved → rejected). Requires a reason. */
export function useRejectPayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      payroll,
      reason,
    }: {
      payroll: PayrollRecord;
      reason: string;
    }) => {
      if (!reason.trim()) {
        throw new Error("A rejection reason is required.");
      }
      const allowedSourceStatuses: PayrollStatus[] = ["review", "approved"];
      if (!allowedSourceStatuses.includes(payroll.status)) {
        throw new Error(
          `Cannot reject a payroll with status "${payroll.status}". Only review or approved payrolls may be rejected.`,
        );
      }

      const { uid, name } = getActorIdentity();
      const today = getTodayInTimezone();

      await payrollRepository.update(payroll.id, {
        status: "rejected",
        rejectionReason: reason,
        rejectedBy: uid,
        rejectedByName: name,
        rejectedAt: today,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "payroll_rejected",
        uid,
        "admin",
        name,
        payroll.id,
        "payroll",
        {
          reason,
          previousStatus: payroll.status,
          month: payroll.month,
          staffId: payroll.staffId,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll rejected");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to reject payroll");
    },
  });
}

/** Return a payroll to draft (review/rejected → draft). Requires a reason. */
export function useReturnPayrollToDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      payroll,
      reason,
    }: {
      payroll: PayrollRecord;
      reason: string;
    }) => {
      if (!reason.trim()) {
        throw new Error("A reason is required to return to draft.");
      }
      const allowedSourceStatuses: PayrollStatus[] = ["review", "rejected"];
      if (!allowedSourceStatuses.includes(payroll.status)) {
        throw new Error(
          `Cannot return a "${payroll.status}" payroll to draft.`,
        );
      }

      const { uid, name } = getActorIdentity();
      const today = getTodayInTimezone();

      await payrollRepository.update(payroll.id, {
        status: "draft",
        returnReason: reason,
        returnedBy: uid,
        returnedByName: name,
        returnedAt: today,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "payroll_returned_to_draft",
        uid,
        "admin",
        name,
        payroll.id,
        "payroll",
        {
          reason,
          previousStatus: payroll.status,
          month: payroll.month,
          staffId: payroll.staffId,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll returned to draft");
    },
    onError: (err: unknown) => {
      toast.error(
        (err as Error).message || "Failed to return payroll to draft",
      );
    },
  });
}

/** Return approved payroll to review for further verification. Requires a reason. */
export function useReturnPayrollToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      payroll,
      reason,
    }: {
      payroll: PayrollRecord;
      reason: string;
    }) => {
      if (!reason.trim()) {
        throw new Error("A reason is required to return to review.");
      }
      if (payroll.status !== "approved") {
        throw new Error(`Only approved payrolls can be returned to review.`);
      }

      const { uid, name } = getActorIdentity();

      await payrollRepository.update(payroll.id, {
        status: "review",
        returnReason: reason,
        returnedBy: uid,
        returnedByName: name,
        returnedAt: getTodayInTimezone(),
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      await auditRepository.logAction(
        "payroll_returned_to_review",
        uid,
        "admin",
        name,
        payroll.id,
        "payroll",
        {
          reason,
          previousStatus: "approved",
          month: payroll.month,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success("Payroll returned to review");
    },
    onError: (err: unknown) => {
      toast.error(
        (err as Error).message || "Failed to return payroll to review",
      );
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary payment transaction (the most critical mutation)
// ─────────────────────────────────────────────────────────────────────────────

export function usePaySalary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      payrollId,
      amountPaid,
      advanceDeduction,
      otherAdjustments,
      advancesToDeduct,
    }: {
      payrollId: string;
      amountPaid: number;
      advanceDeduction: number;
      otherAdjustments: number;
      advancesToDeduct: string[];
    }) => {
      // Validate inputs before entering transaction
      if (isNaN(amountPaid) || amountPaid < 0) {
        throw new Error("Amount paid must be a valid non-negative number.");
      }

      const { uid, name } = getActorIdentity();
      const paymentDate = getTodayInTimezone();
      let staffIdForNotification = "";
      let monthForNotification = "";

      await runTransaction(db, async (transaction) => {
        // ── 1. Read and verify payroll ──────────────────────────────────────
        const payrollRef = doc(db, "payroll", payrollId);
        const payrollDoc = await transaction.get(payrollRef);

        if (!payrollDoc.exists()) {
          throw new Error("Payroll record does not exist.");
        }

        const payrollData = payrollDoc.data() as PayrollRecord;

        if (payrollData.status !== "approved") {
          throw new Error(
            `Payroll must be in approved status before payment. Current status: ${payrollData.status}.`,
          );
        }

        staffIdForNotification = payrollData.staffId;
        monthForNotification = payrollData.month;

        // ── 2. Read and validate each selected advance inside the transaction ─
        const advanceRefs = advancesToDeduct.map((id) =>
          doc(db, "salaryAdvances", id),
        );
        const advanceDocs =
          advanceRefs.length > 0
            ? await Promise.all(advanceRefs.map((ref) => transaction.get(ref)))
            : [];

        for (const adDoc of advanceDocs) {
          const adData = adDoc.data();

          if (!adDoc.exists() || !adData) {
            throw new Error(`Advance record ${adDoc.id} not found.`);
          }
          if (adData.status !== "pending") {
            throw new Error(
              `Advance ${adDoc.id} is no longer pending (current status: ${adData.status}). Payment aborted.`,
            );
          }
          if (adData.staffId !== payrollData.staffId) {
            throw new Error(
              `Advance ${adDoc.id} belongs to a different employee. Payment aborted.`,
            );
          }
          // Legacy advances (null payrollMonth) must never be deducted automatically
          if (
            adData.payrollMonth === null ||
            adData.payrollMonth === undefined
          ) {
            throw new Error(
              `Advance ${adDoc.id} has no payroll period assigned. Assign a period before deducting.`,
            );
          }
          if (adData.payrollMonth !== payrollData.month) {
            throw new Error(
              `Advance ${adDoc.id} is for period ${adData.payrollMonth}, not ${payrollData.month}. Payment aborted.`,
            );
          }
        }

        // ── 3. Apply mutations atomically ───────────────────────────────────
        const suggestedPayable =
          payrollData.netSalary - advanceDeduction + otherAdjustments;

        transaction.update(payrollRef, {
          status: "paid",
          paymentDate,
          advanceDeduction,
          otherAdjustments,
          suggestedPayable,
          amountPaid,
          advancesDeducted: advancesToDeduct,
          updatedAt: serverTimestamp(),
        });

        for (const adRef of advanceRefs) {
          transaction.update(adRef, {
            status: "deducted",
            payrollId,
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Transaction committed — now do post-commit side effects
      await auditRepository.logAction(
        "salary_paid",
        uid,
        "admin",
        name,
        payrollId,
        "payroll",
        {
          amountPaid,
          advanceDeduction,
          otherAdjustments,
          advancesDeducted: advancesToDeduct,
          month: monthForNotification,
          staffId: staffIdForNotification,
        },
      );

      await notificationRepository.createNotification({
        recipientId: staffIdForNotification,
        recipientRole: "staff",
        channel: "in_app",
        title: `Salary Paid: ${monthForNotification}`,
        message: `Your salary for ${monthForNotification} (₹${amountPaid.toLocaleString()}) has been transferred successfully.`,
        type: "salary_paid",
        priority: "high",
        metadata: { payrollId, amount: String(amountPaid) },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.advances,
      });
      toast.success("Salary marked as paid successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to process salary payment");
    },
  });
}
