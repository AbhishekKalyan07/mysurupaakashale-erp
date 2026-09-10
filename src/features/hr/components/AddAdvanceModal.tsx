import { useState, useEffect } from "react";
import { PremiumModal } from "@/shared/components/ui/PremiumModal";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import { useAddSalaryAdvance } from "../hooks/usePayroll";
import { getTodayInTimezone } from "@/shared/lib/date";
import type { UserProfile } from "@/shared/types";

interface AddAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: UserProfile | null;
}

export function AddAdvanceModal({
  isOpen,
  onClose,
  staff,
}: AddAdvanceModalProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(getTodayInTimezone());

  // Default to current YYYY-MM
  const currentMonth = getTodayInTimezone().substring(0, 7);
  const [payrollMonth, setPayrollMonth] = useState(currentMonth);

  const addAdvance = useAddSalaryAdvance();

  // Reset state completely when modal opens/closes or staff changes
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setReason("");
      setNotes("");
      setDate(getTodayInTimezone());
      setPayrollMonth(currentMonth);
    }
  }, [isOpen, staff?.id, currentMonth]);

  if (!staff) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Amount must be a positive number");
      return;
    }

    if (!payrollMonth.match(/^\d{4}-\d{2}$/)) {
      alert("Payroll month must be in YYYY-MM format.");
      return;
    }

    await addAdvance.mutateAsync({
      staffId: staff.id,
      amount: parsedAmount,
      date,
      payrollMonth,
      reason,
      notes,
    });

    onClose();
  };

  return (
    <PremiumModal isOpen={isOpen} onClose={onClose} title="Add Salary Advance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Staff Member
          </label>
          <div className="p-3 bg-background-alt rounded-lg font-medium text-primary border border-border/50">
            {staff.fullName}{" "}
            <span className="text-sm text-text-muted">
              ({staff.displayId || "EMP"})
            </span>
          </div>
        </div>

        <Input
          label="Advance Amount (₹)"
          type="number"
          min="1"
          step="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date Received"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Payroll Month (YYYY-MM)"
            type="month"
            required
            value={payrollMonth}
            onChange={(e) => setPayrollMonth(e.target.value)}
            helperText="The payroll period this advance will be deducted from."
          />
        </div>

        <Input
          label="Reason"
          type="text"
          required
          placeholder="e.g. Personal emergency"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <Input
          label="Notes (Optional)"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={addAdvance.isPending}
          >
            Add Advance
          </Button>
        </div>
      </form>
    </PremiumModal>
  );
}
