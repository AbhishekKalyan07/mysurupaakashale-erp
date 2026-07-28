import { useState } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { PremiumTable, PremiumTableRow, PremiumTableCell } from '@/shared/components/ui/PremiumTable';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { usePayrollByMonth, useGeneratePayroll, usePaySalary, useUpdatePayrollStatus } from '../hooks/usePayroll';
import { useStaffUsers } from '@/features/admin/hooks/useAdmin';
import { useBusinessSettings } from '@/features/admin/hooks/useSettings';
import { salaryProfileRepository } from '@/shared/services/firestore/payrollRepository';
import { attendanceRepository } from '@/shared/services/firestore/attendanceRepository';
import { Banknote, FileText, CheckCircle, ArrowRight, Archive, CheckCircle2, TrendingDown } from 'lucide-react';
import { PayslipPrintView } from '../components/PayslipPrintView';

export function PayrollDashboardPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [printRecord, setPrintRecord] = useState<any>(null);
  const { data: staff, isLoading: isLoadingStaff } = useStaffUsers();
  const { data: payrolls, isLoading: isLoadingPayroll } = usePayrollByMonth(month);
  const generatePayroll = useGeneratePayroll();
  const paySalary = usePaySalary();
  const { data: settings } = useBusinessSettings();
  const updateStatus = useUpdatePayrollStatus();

  const isLoading = isLoadingStaff || isLoadingPayroll;

  if (isLoading) return <LoadingScreen />;

  const staffList = staff || [];
  const payrollList = payrolls || [];

  const exportCSV = () => {
    const headers = ['Staff ID', 'Name', 'Role', 'Status', 'Net Salary'];
    const rows = staffList.map(user => {
      const record = payrollList.find(p => p.staffId === user.id);
      const status = record?.status === 'paid' ? 'Paid' : record ? 'Draft' : 'Not Generated';
      const salary = record ? record.netSalary : 0;
      return [user.id, user.fullName, user.role, status, salary];
    });
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(',') + "\n"
      + rows.map(e => e.join(',')).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_report_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  const handleGenerate = async (user: any) => {
    // 1. Fetch Salary Profile
    const profile = await salaryProfileRepository.getProfile(user.id);
    const basic = profile?.basicSalary || 15000;
    const otRate = profile?.overtimeRate || 100;

    // 2. Fetch Business Settings
    const standardWorkingDays = settings?.payroll?.standardWorkingDays || 22;
    const standardWorkingHours = settings?.payroll?.standardWorkingHours || 8;
    const taxPercentage = settings?.payroll?.taxPercentage || 0;
    const leaveMultiplier = settings?.payroll?.leaveDeductionMultiplier || 1;

    // 3. Fetch Attendance
    const startDate = `${month}-01`;
    const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const endDate = `${month}-${lastDay}`;
    const attendanceRecords = await attendanceRepository.getAttendanceByStaff(user.id, startDate, endDate);

    // 4. Calculate
    const presentDays = attendanceRecords.filter(a => a.status === 'present').length;
    const halfDays = attendanceRecords.filter(a => a.status === 'half_day').length;
    const totalWorkingDays = presentDays + (halfDays * 0.5);

    let overtimeHours = 0;
    attendanceRecords.forEach(a => {
      if (a.totalWorkingHours > standardWorkingHours) {
        overtimeHours += (a.totalWorkingHours - standardWorkingHours);
      }
    });

    const overtimeBonus = overtimeHours * otRate;
    
    // Deductions: if they worked fewer days than standard, deduct proportionately.
    // Or just calculate daily wage.
    const dailyWage = basic / standardWorkingDays;
    let leaveDeduction = 0;
    if (totalWorkingDays < standardWorkingDays) {
      const daysShort = standardWorkingDays - totalWorkingDays;
      leaveDeduction = daysShort * dailyWage * leaveMultiplier;
    }

    const gross = basic + overtimeBonus;
    const taxDeduction = gross * (taxPercentage / 100);
    const deductions = leaveDeduction + taxDeduction;
    const net = Math.max(0, gross - deductions);

    await generatePayroll.mutateAsync({
      staffId: user.id,
      staffName: user.fullName,
      month,
      basicSalary: basic,
      workingDays: totalWorkingDays,
      presentDays,
      overtimeHours,
      overtimeRate: otRate,
      bonus: overtimeBonus,
      deductions,
      deductionReason: taxDeduction > 0 ? `Tax: ${taxDeduction.toFixed(0)}, Leave: ${leaveDeduction.toFixed(0)}` : `Leave: ${leaveDeduction.toFixed(0)}`,
      grossSalary: gross,
      netSalary: net,
    });
  };

  const handleStatusUpdate = async (id: string, status: any) => {
    await updateStatus.mutateAsync({ id, status });
  };

  const handlePay = async (id: string) => {
    if (!confirm('Mark this salary as paid?')) return;
    await paySalary.mutateAsync(id);
  };

  const handlePrint = (record: any) => {
    setPrintRecord(record);
    setTimeout(() => {
      window.print();
    }, 100); // Wait for render
  };

  return (
    <>
    <div className="space-y-8 print:hidden">
      <HeroBanner 
        userName="Accounts Team"
        subtitle="Generate and manage monthly staff salaries."
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV} className="shrink-0 bg-white text-primary">
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
          value={payrollList.filter(p => p.status === 'paid' || p.status === 'archived').length}
          icon={<CheckCircle2 size={24} />}
          color="mint"
        />
        <MetricCard
          title="Pending Payable"
          value={`₹${payrollList.filter(p => p.status === 'approved' || p.status === 'review' || p.status === 'draft').reduce((acc, curr) => acc + curr.netSalary, 0).toLocaleString()}`}
          icon={<TrendingDown size={24} className="text-warning" />}
          color="amber"
        />
        <MetricCard
          title="Monthly Expense"
          value={`₹${payrollList.filter(p => p.status === 'paid' || p.status === 'archived').reduce((acc, curr) => acc + curr.netSalary, 0).toLocaleString()}`}
          icon={<Banknote size={24} />}
          color="lavender"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6">
          <PremiumTable
            columns={['Staff Member', 'Role', 'Status', 'Net Salary', 'Actions']}
            isEmpty={staffList.length === 0}
            emptyState="No staff found. Add staff members in Staff Management first."
          >
            {staffList.map(user => {
              const record = payrollList.find(p => p.staffId === user.id);
              const isGenerated = !!record;

              return (
                <PremiumTableRow key={user.id}>
                  <PremiumTableCell>
                    <div className="text-right md:text-left">
                      <div className="font-semibold text-primary">{user.fullName}</div>
                      <div className="text-xs text-text-muted font-data">{user.id}</div>
                    </div>
                  </PremiumTableCell>
                  <PremiumTableCell className="capitalize text-text-muted">
                    {user.role.replace('_', ' ')}
                  </PremiumTableCell>
                  <PremiumTableCell>
                    <Badge variant={
                      record?.status === 'paid' ? 'success' : 
                      record?.status === 'archived' ? 'default' : 
                      record?.status === 'approved' ? 'success' :
                      record?.status === 'review' ? 'warning' :
                      isGenerated ? 'warning' : 'default'
                    } className="capitalize">
                      {record?.status || 'Not Generated'}
                    </Badge>
                  </PremiumTableCell>
                  <PremiumTableCell className="font-data font-bold text-primary">
                    {isGenerated ? `₹${record.netSalary.toLocaleString()}` : '-'}
                  </PremiumTableCell>
                  <PremiumTableCell>
                    <div className="flex justify-end gap-2">
                      {!isGenerated ? (
                        <Button 
                          size="sm" 
                          onClick={() => handleGenerate(user)}
                          isLoading={generatePayroll.isPending && generatePayroll.variables?.staffId === user.id}
                        >
                          <FileText size={14} className="mr-1" /> Generate
                        </Button>
                      ) : record?.status === 'draft' ? (
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleStatusUpdate(record.id, 'review')}
                          isLoading={updateStatus.isPending && updateStatus.variables?.id === record.id}
                        >
                          <ArrowRight size={14} className="mr-1" /> Submit for Review
                        </Button>
                      ) : record?.status === 'review' ? (
                        <Button 
                          size="sm" 
                          variant="primary"
                          onClick={() => handleStatusUpdate(record.id, 'approved')}
                          isLoading={updateStatus.isPending && updateStatus.variables?.id === record.id}
                        >
                          <CheckCircle size={14} className="mr-1" /> Approve
                        </Button>
                      ) : record?.status === 'approved' ? (
                        <Button 
                          size="sm" 
                          variant="primary"
                          onClick={() => handlePay(record.id)}
                          isLoading={paySalary.isPending && paySalary.variables === record.id}
                        >
                          <Banknote size={14} className="mr-1" /> Mark Paid
                        </Button>
                      ) : record?.status === 'paid' ? (
                        <>
                          <span className="text-success flex items-center gap-1 text-sm font-semibold">
                            <CheckCircle size={14} /> Paid {record.paymentDate}
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
                            onClick={() => handleStatusUpdate(record.id, 'archived')}
                            isLoading={updateStatus.isPending && updateStatus.variables?.id === record.id}
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
      <PayslipPrintView payroll={printRecord} settings={settings} />
    )}
    </>
  );
}
