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
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import {
  useAdvancesByPeriod,
  useAllAdvancesByStaff,
} from "../hooks/usePayroll";
import { useStaffUsers } from "@/features/admin/hooks/useAdmin";
import { PlusCircle, AlertTriangle } from "lucide-react";
import { EditAdvanceModal } from "../components/EditAdvanceModal";
import { AddAdvanceModal } from "../components/AddAdvanceModal";

export function SalaryAdvanceHistoryPage() {
  const [filterMode, setFilterMode] = useState<"month" | "staff">("month");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [staffId, setStaffId] = useState<string>("");

  const { data: staffList, isLoading: isLoadingStaff } = useStaffUsers();

  const { data: periodAdvances, isLoading: isLoadingPeriod } =
    useAdvancesByPeriod(filterMode === "month" ? month : null);
  const { data: staffAdvances, isLoading: isLoadingStaffAdv } =
    useAllAdvancesByStaff(filterMode === "staff" ? staffId : null);

  const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const isLoading =
    isLoadingStaff ||
    (filterMode === "month" ? isLoadingPeriod : isLoadingStaffAdv);
  const advances =
    filterMode === "month" ? periodAdvances || [] : staffAdvances || [];

  const selectedStaffForAdd = staffList?.find((s) => s.id === staffId) || null;

  if (isLoading && !advances.length) return <LoadingScreen />;

  const handleRowClick = (advance: any) => {
    setSelectedAdvance(advance);
  };

  return (
    <>
      <div className="space-y-8">
        <HeroBanner
          userName="Accounts Team"
          subtitle="Manage and track salary advances across all employees."
          actions={
            <Button
              variant="primary"
              onClick={() => setIsAddOpen(true)}
              disabled={filterMode !== "staff" || !staffId}
              title={
                filterMode !== "staff" || !staffId
                  ? "Select a staff member first to add advance"
                  : ""
              }
            >
              <PlusCircle size={16} className="mr-2" /> Add Advance
            </Button>
          }
        />

        <Card className="p-4 flex flex-col md:flex-row gap-4 items-end bg-background-alt border border-border/50">
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Filter By
            </label>
            <div className="flex bg-background border border-border/50 rounded-lg p-1 w-max">
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterMode === "month" ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-primary"}`}
                onClick={() => setFilterMode("month")}
              >
                Payroll Month
              </button>
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterMode === "staff" ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-primary"}`}
                onClick={() => setFilterMode("staff")}
              >
                Staff Member
              </button>
            </div>
          </div>

          {filterMode === "month" && (
            <div className="w-full md:w-64">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Select Month
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          )}

          {filterMode === "staff" && (
            <div className="w-full md:w-64">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Select Staff
              </label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">-- Choose Staff --</option>
                {staffList?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.displayId || "EMP"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="p-6">
            <PremiumTable
              columns={[
                "Date",
                "Staff Member",
                "Amount",
                "Payroll Period",
                "Status",
                "Actions",
              ]}
              isEmpty={advances.length === 0}
              emptyState={
                filterMode === "staff" && !staffId
                  ? "Select a staff member to view their advances."
                  : "No advances found for the selected filter."
              }
            >
              {advances.map((advance) => {
                const staffUser = staffList?.find(
                  (s) => s.id === advance.staffId,
                );
                const isLegacy = !advance.payrollMonth;

                return (
                  <PremiumTableRow
                    key={advance.id}
                    onClick={() => handleRowClick(advance)}
                    className="cursor-pointer hover:bg-background-alt/50"
                  >
                    <PremiumTableCell className="font-data">
                      {advance.date}
                    </PremiumTableCell>
                    <PremiumTableCell>
                      <div className="font-medium text-primary">
                        {staffUser?.fullName || "Unknown"}
                      </div>
                    </PremiumTableCell>
                    <PremiumTableCell className="font-data font-bold text-primary">
                      ₹{advance.amount.toLocaleString()}
                    </PremiumTableCell>
                    <PremiumTableCell>
                      {isLegacy ? (
                        <span className="text-warning text-sm italic font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Legacy
                          (Unassigned)
                        </span>
                      ) : (
                        <span className="font-data font-medium">
                          {advance.payrollMonth}
                        </span>
                      )}
                    </PremiumTableCell>
                    <PremiumTableCell>
                      <Badge
                        variant={
                          advance.status === "pending"
                            ? "warning"
                            : advance.status === "deducted"
                              ? "success"
                              : "danger"
                        }
                        className="capitalize"
                      >
                        {advance.status}
                      </Badge>
                    </PremiumTableCell>
                    <PremiumTableCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(advance);
                        }}
                      >
                        View / Edit
                      </Button>
                    </PremiumTableCell>
                  </PremiumTableRow>
                );
              })}
            </PremiumTable>
          </div>
        </Card>
      </div>

      <EditAdvanceModal
        isOpen={!!selectedAdvance}
        onClose={() => setSelectedAdvance(null)}
        advance={selectedAdvance}
        staff={
          staffList?.find((s) => s.id === selectedAdvance?.staffId) || null
        }
      />

      <AddAdvanceModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        staff={selectedStaffForAdd}
      />
    </>
  );
}
