import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { usePayrollByMonth, useGeneratePayroll, usePaySalary, useUpdatePayrollStatus } from '../hooks/usePayroll';
import { useStaffUsers } from '@/features/admin/hooks/useAdmin';
import { useBusinessSettings } from '@/features/admin/hooks/useSettings';
import { salaryProfileRepository } from '@/shared/services/firestore/payrollRepository';
import { attendanceRepository } from '@/shared/services/firestore/attendanceRepository';
import { Banknote, FileText, CheckCircle, ArrowRight, Archive } from 'lucide-react';
import { PayslipPrintView } from '../components/PayslipPrintView';

export function PayrollDashboardPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [printRecord, setPrintRecord] = useState<any>(null);
  const { data: staff, isLoading: isLoadingStaff } = useStaffUsers();
  const { data: payrolls, isLoading: isLoadingPayroll } = usePayrollByMonth(month);
  const generatePayroll = useGeneratePayroll();
  const paySalary = usePaySalary();

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

  const { data: settings } = useBusinessSettings();
  const updateStatus = useUpdatePayrollStatus();

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Banknote className="text-leaf-600" />
            Payroll Management
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Generate and manage monthly staff salaries.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" onClick={exportCSV} className="shrink-0">
            Export CSV
          </Button>
          <input 
            type="month" 
            value={month} 
            onChange={(e) => setMonth(e.target.value)}
            className="border border-rice-300 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Total Generated</div>
          <div className="text-2xl font-bold text-ink-900 font-data">{payrollList.length} / {staffList.length}</div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Paid Staff</div>
          <div className="text-2xl font-bold text-success font-data">
            {payrollList.filter(p => p.status === 'paid' || p.status === 'archived').length}
          </div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Pending Payable</div>
          <div className="text-2xl font-bold text-warning font-data">
            ₹{payrollList.filter(p => p.status === 'approved' || p.status === 'review' || p.status === 'draft').reduce((acc, curr) => acc + curr.netSalary, 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-4 flex flex-col gap-1">
          <div className="text-sm font-medium text-ink-500">Monthly Expense</div>
          <div className="text-2xl font-bold text-leaf-600 font-data">
            ₹{payrollList.filter(p => p.status === 'paid' || p.status === 'archived').reduce((acc, curr) => acc + curr.netSalary, 0).toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {staffList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 text-ink-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Staff Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Net Salary</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rice-100">
                {staffList.map(user => {
                  const record = payrollList.find(p => p.staffId === user.id);
                  const isGenerated = !!record;

                  return (
                    <tr key={user.id} className="hover:bg-rice-25">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink-900">{user.fullName}</div>
                        <div className="text-xs text-ink-500 font-data">{user.id}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-ink-600">
                        {user.role.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={
                          record?.status === 'paid' ? 'success' : 
                          record?.status === 'archived' ? 'neutral' : 
                          record?.status === 'approved' ? 'success' :
                          record?.status === 'review' ? 'warning' :
                          isGenerated ? 'warning' : 'neutral'
                        } className="capitalize">
                          {record?.status || 'Not Generated'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-data font-bold text-ink-900">
                        {isGenerated ? `₹${record.netSalary.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                              <span className="text-leaf-600 flex items-center gap-1 text-sm font-semibold">
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
                              <span className="text-ink-500 flex items-center gap-1 text-sm font-semibold">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState title="No Staff Found" description="Add staff members in Staff Management first." />
          </div>
        )}
      </Card>
    </div>
    
    {printRecord && (
      <PayslipPrintView payroll={printRecord} settings={settings} />
    )}
    </>
  );
}
