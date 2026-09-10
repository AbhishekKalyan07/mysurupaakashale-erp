import { useState } from "react";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import {
  PremiumTable,
  PremiumTableRow,
  PremiumTableCell,
} from "@/shared/components/ui/PremiumTable";
import { HeroBanner } from "@/shared/components/ui/HeroBanner";
import { MetricCard } from "@/shared/components/ui/MetricCard";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { PremiumModal } from "@/shared/components/ui/PremiumModal";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import {
  usePayrollByMonth,
  useGeneratePayroll,
  useUpdatePayrollStatus,
  useRejectPayroll,
  useReturnPayrollToDraft,
  useReturnPayrollToReview,
} from "../hooks/usePayroll";
import { useStaffUsers } from "@/features/admin/hooks/useAdmin";
import { useBusinessSettings } from "@/features/admin/hooks/useSettings";
import { salaryProfileRepository } from "@/shared/services/firestore/payrollRepository";
import { attendanceRepository } from "@/shared/services/firestore/attendanceRepository";
import { calculatePayroll } from "../utils/payrollCalculator";
import {
  Banknote,
  FileText,
  CheckCircle,
  ArrowRight,
  Archive,
  CheckCircle2,
  TrendingDown,
  PlusCircle,
  XCircle,
  Undo2,
} from "lucide-react";
import { PayslipPrintView } from "../components/PayslipPrintView";
import { AddAdvanceModal } from "../components/AddAdvanceModal";
import { PaymentConfirmationModal } from "../components/PaymentConfirmationModal";
import { Link } from "react-router-dom";

export function PayrollDashboardPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [printRecord, setPrintRecord] = useState<any>(null);
  const { data: staff, isLoading: isLoadingStaff } = useStaffUsers();
  const { data: payrolls, isLoading: isLoadingPayroll } =
    usePayrollByMonth(month);
  const generatePayroll = useGeneratePayroll();
  const { data: settings } = useBusinessSettings();

  const updateStatus = useUpdatePayrollStatus();
  const rejectPayroll = useRejectPayroll();
  const returnToDraft = useReturnPayrollToDraft();
  const returnToReview = useReturnPayrollToReview();

  const [advanceModalStaff, setAdvanceModalStaff] = useState<any>(null);
  const [paymentModalRecord, setPaymentModalRecord] = useState<{
    staff: any;
    record: any;
  } | null>(null);

  // State for Reason Modal
  const [reasonModal, setReasonModal] = useState<{
    isOpen: boolean;
    record: any | null;
    action: "reject" | "return_to_draft" | "return_to_review" | null;
    reason: string;
  }>({ isOpen: false, record: null, action: null, reason: "" });

  const isLoading = isLoadingStaff || isLoadingPayroll;

  if (isLoading) return <LoadingScreen />;

  const staffList = staff || [];
  const payrollList = payrolls || [];

  const exportCSV = () => {
    const headers = ["Staff ID", "Name", "Role", "Status", "Net Salary"];
    const rows = staffList.map((user) => {
      const record = payrollList.find((p) => p.staffId === user.id);
      const status =
        record?.status === "paid" ? "Paid" : record ? "Draft" : "Not Generated";
      const salary = record ? record.netSalary : 0;
      return [user.id, user.fullName, user.role, status, salary];
    });
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_report_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerate = async (user: any) => {
    const profile = await salaryProfileRepository.getProfile(user.id);
    const standardWorkingDays = settings?.payroll?.standardWorkingDays || 22;
    const standardWorkingHours = settings?.payroll?.standardWorkingHours || 8;
    const taxPercentage = settings?.payroll?.taxPercentage || 0;
    const leaveDeductionMultiplier =
      settings?.payroll?.leaveDeductionMultiplier || 1;

    const startDate = `${month}-01`;
    const lastDay = new Date(
      parseInt(month.split("-")[0]),
      parseInt(month.split("-")[1]),
      0,
    ).getDate();
    const endDate = `${month}-${lastDay}`;
    const attendanceRecords = await attendanceRepository.getAttendanceByStaff(
      user.id,
      startDate,
      endDate,
    );

    const results = calculatePayroll(profile, attendanceRecords, {
      standardWorkingDays,
      standardWorkingHours,
      taxPercentage,
      leaveDeductionMultiplier,
    });

    await generatePayroll.mutateAsync({
      staffId: user.id,
      staffName: user.fullName,
      month,
      basicSalary: results.basicSalary,
      workingDays: results.workingDays,
      presentDays: results.presentDays,
      overtimeHours: results.overtimeHours,
      overtimeRate: results.overtimeRate,
      bonus: results.bonus,
      deductions: results.deductions,
      deductionReason:
        results.taxDeduction > 0
          ? `Tax: ${results.taxDeduction.toFixed(0)}, Leave: ${results.leaveDeduction.toFixed(0)}`
          : `Leave: ${results.leaveDeduction.toFixed(0)}`,
      grossSalary: results.grossSalary,
      netSalary: results.netSalary,
    });
  };

  const handleStatusUpdate = async (id: string, status: any) => {
    await updateStatus.mutateAsync({ id, status });
  };

  const handleReasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !reasonModal.record ||
      !reasonModal.action ||
      !reasonModal.reason.trim()
    )
      return;

    if (reasonModal.action === "reject") {
      await rejectPayroll.mutateAsync({
        payroll: reasonModal.record,
        reason: reasonModal.reason,
      });
    } else if (reasonModal.action === "return_to_draft") {
      await returnToDraft.mutateAsync({
        payroll: reasonModal.record,
        reason: reasonModal.reason,
      });
    } else if (reasonModal.action === "return_to_review") {
      await returnToReview.mutateAsync({
        payroll: reasonModal.record,
        reason: reasonModal.reason,
      });
    }

    setReasonModal({ isOpen: false, record: null, action: null, reason: "" });
  };

  const openReasonModal = (
    record: any,
    action: "reject" | "return_to_draft" | "return_to_review",
  ) => {
    setReasonModal({ isOpen: true, record, action, reason: "" });
  };

  const handlePay = (staff: any, record: any) => {
    setPaymentModalRecord({ staff, record });
  };

  const handlePrint = (record: any) => {
    setPrintRecord(record);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <>
      <div className="space-y-8 print:hidden">
        <HeroBanner
          userName="Accounts Team"
          subtitle="Generate and manage monthly staff salaries."
          actions={
            <>
              <Link to="/admin/salary-advances">
                <Button
                  variant="secondary"
                  className="shrink-0 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                >
                  <Banknote size={16} className="mr-2" /> Advance History
                </Button>
              </Link>
              <Button
                variant="secondary"
                onClick={exportCSV}
                className="shrink-0 bg-white text-primary"
              >
                Export CSV
              </Button>
              <div className="flex gap-2 items-center bg-white/10 backdrop-blur-md p-1 rounded-xl">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-transparent border-none text-primary font-medium text-sm focus:ring-0 cursor-pointer"
                />
              </div>
            </>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <MetricCard
            title="Total Generated"
            value={`${payrollList.length} / ${staffList.length}`}
            icon={<FileText size={24} />}
            color="blue"
          />
          <MetricCard
            title="Paid Staff"
            value={
              payrollList.filter(
                (p) => p.status === "paid" || p.status === "archived",
              ).length
            }
            icon={<CheckCircle2 size={24} />}
            color="mint"
          />
          <MetricCard
            title="Pending Payable"
            value={`₹${payrollList
              .filter(
                (p) =>
                  p.status === "approved" ||
                  p.status === "review" ||
                  p.status === "draft",
              )
              .reduce((acc, curr) => acc + curr.netSalary, 0)
              .toLocaleString()}`}
            icon={<TrendingDown size={24} className="text-warning" />}
            color="amber"
          />
          <MetricCard
            title="Monthly Expense"
            value={`₹${payrollList
              .filter((p) => p.status === "paid" || p.status === "archived")
              .reduce((acc, curr) => acc + curr.netSalary, 0)
              .toLocaleString()}`}
            icon={<Banknote size={24} />}
            color="lavender"
          />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-6">
            <PremiumTable
              columns={[
                "Staff Member",
                "Role",
                "Status",
                "Net Salary",
                "Actions",
              ]}
              isEmpty={staffList.length === 0}
              emptyState="No staff found. Add staff members in Staff Management first."
            >
              {staffList.map((user) => {
                const record = payrollList.find((p) => p.staffId === user.id);
                const isGenerated = !!record;

                return (
                  <PremiumTableRow key={user.id}>
                    <PremiumTableCell>
                      <div className="text-right md:text-left">
                        <div className="font-semibold text-primary">
                          {user.fullName}
                        </div>
                      </div>
                    </PremiumTableCell>
                    <PremiumTableCell className="capitalize text-text-muted">
                      {user.role.replace("_", " ")}
                    </PremiumTableCell>
                    <PremiumTableCell>
                      <Badge
                        variant={
                          record?.status === "paid"
                            ? "success"
                            : record?.status === "archived"
                              ? "default"
                              : record?.status === "approved"
                                ? "success"
                                : record?.status === "review"
                                  ? "warning"
                                  : record?.status === "rejected"
                                    ? "danger"
                                    : isGenerated
                                      ? "default"
                                      : "default"
                        }
                        className="capitalize"
                      >
                        {record?.status || "Not Generated"}
                      </Badge>
                    </PremiumTableCell>
                    <PremiumTableCell className="font-data font-bold text-primary">
                      {isGenerated
                        ? `₹${record.netSalary.toLocaleString()}`
                        : "-"}
                    </PremiumTableCell>
                    <PremiumTableCell>
                      <div className="flex justify-end gap-2">
                        {!isGenerated ? (
                          <Button
                            size="sm"
                            onClick={() => handleGenerate(user)}
                            isLoading={
                              generatePayroll.isPending &&
                              generatePayroll.variables?.staffId === user.id
                            }
                          >
                            <FileText size={14} className="mr-1" /> Generate
                          </Button>
                        ) : record?.status === "draft" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              handleStatusUpdate(record.id, "review")
                            }
                            isLoading={
                              updateStatus.isPending &&
                              updateStatus.variables?.id === record.id
                            }
                          >
                            <ArrowRight size={14} className="mr-1" /> Submit for
                            Review
                          </Button>
                        ) : record?.status === "review" ? (
                          <>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openReasonModal(record, "reject")}
                            >
                              <XCircle size={14} className="mr-1" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                handleStatusUpdate(record.id, "approved")
                              }
                              isLoading={
                                updateStatus.isPending &&
                                updateStatus.variables?.id === record.id
                              }
                            >
                              <CheckCircle size={14} className="mr-1" /> Approve
                            </Button>
                          </>
                        ) : record?.status === "approved" ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                openReasonModal(record, "return_to_review")
                              }
                            >
                              <Undo2 size={14} className="mr-1" /> Return to
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handlePay(user, record)}
                            >
                              <Banknote size={14} className="mr-1" /> Mark Paid
                            </Button>
                          </>
                        ) : record?.status === "rejected" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              openReasonModal(record, "return_to_draft")
                            }
                          >
                            <Undo2 size={14} className="mr-1" /> Return to Draft
                          </Button>
                        ) : record?.status === "paid" ? (
                          <>
                            <span className="text-success flex items-center gap-1 text-sm font-semibold">
                              <CheckCircle size={14} /> Paid{" "}
                              {record.paymentDate}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handlePrint(record)}
                            >
                              Print
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                handleStatusUpdate(record.id, "archived")
                              }
                              isLoading={
                                updateStatus.isPending &&
                                updateStatus.variables?.id === record.id
                              }
                            >
                              <Archive size={14} />
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-text-muted flex items-center gap-1 text-sm font-semibold">
                              Archived
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handlePrint(record)}
                            >
                              Print
                            </Button>
                          </div>
                        )}

                        {(!isGenerated ||
                          (record?.status !== "paid" &&
                            record?.status !== "archived")) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAdvanceModalStaff(user)}
                            title="Add Salary Advance"
                          >
                            <PlusCircle size={14} />
                          </Button>
                        )}
                      </div>
                    </PremiumTableCell>
                  </PremiumTableRow>
                );
              })}
            </PremiumTable>
          </div>
        </Card>
      </div>

      {printRecord && (
        <PayslipPrintView
          payroll={printRecord}
          staff={staffList.find((s) => s.id === printRecord.staffId)}
          settings={settings}
        />
      )}

      <AddAdvanceModal
        isOpen={!!advanceModalStaff}
        onClose={() => setAdvanceModalStaff(null)}
        staff={advanceModalStaff}
      />

      <PaymentConfirmationModal
        isOpen={!!paymentModalRecord}
        onClose={() => setPaymentModalRecord(null)}
        staff={paymentModalRecord?.staff}
        payrollRecord={paymentModalRecord?.record}
      />

      <PremiumModal
        isOpen={reasonModal.isOpen}
        onClose={() =>
          setReasonModal({
            isOpen: false,
            record: null,
            action: null,
            reason: "",
          })
        }
        title={
          reasonModal.action === "reject"
            ? "Reject Payroll"
            : reasonModal.action === "return_to_draft"
              ? "Return to Draft"
              : "Return to Review"
        }
      >
        <form onSubmit={handleReasonSubmit} className="space-y-4">
          <Input
            label="Reason"
            type="text"
            required
            placeholder="Please provide a reason for this action..."
            value={reasonModal.reason}
            onChange={(e) =>
              setReasonModal({ ...reasonModal, reason: e.target.value })
            }
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                setReasonModal({
                  isOpen: false,
                  record: null,
                  action: null,
                  reason: "",
                })
              }
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={
                rejectPayroll.isPending ||
                returnToDraft.isPending ||
                returnToReview.isPending
              }
            >
              Confirm
            </Button>
          </div>
        </form>
      </PremiumModal>
    </>
  );
}
