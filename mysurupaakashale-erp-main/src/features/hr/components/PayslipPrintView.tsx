import type { PayrollRecord } from '@/shared/types';

interface PayslipProps {
  payroll: PayrollRecord;
  settings: any;
}

export function PayslipPrintView({ payroll, settings }: PayslipProps) {
  return (
    <div className="print-only fixed inset-0 bg-white z-[9999] p-8 hidden print:block text-ink-900 font-sans">
      <div className="max-w-3xl mx-auto border border-ink-200 p-8 rounded-none">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-ink-200 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-leaf-700 uppercase tracking-wide">
              {settings?.companyProfile?.name || 'Mysuru Paakashale'}
            </h1>
            <p className="text-sm mt-1">{settings?.companyProfile?.tagline}</p>
            <p className="text-sm">{settings?.companyProfile?.address}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold uppercase tracking-wider text-ink-500">Payslip</h2>
            <p className="text-sm mt-1"><strong>Month:</strong> {payroll.month}</p>
            <p className="text-sm"><strong>Date:</strong> {new Date().toLocaleDateString('en-IN')}</p>
          </div>
        </div>

        {/* Employee Info */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div>
            <p className="text-sm text-ink-500">Employee Name</p>
            <p className="font-bold text-lg">{payroll.staffName}</p>
          </div>
          <div>
            <p className="text-sm text-ink-500">Employee ID</p>
            <p className="font-bold text-lg font-data">{payroll.staffId}</p>
          </div>
          <div>
            <p className="text-sm text-ink-500">Total Working Days</p>
            <p className="font-bold text-lg font-data">{payroll.workingDays}</p>
          </div>
          <div>
            <p className="text-sm text-ink-500">Present Days</p>
            <p className="font-bold text-lg font-data">{payroll.presentDays}</p>
          </div>
        </div>

        {/* Salary Details */}
        <table className="w-full text-left border-collapse mb-8">
          <thead>
            <tr className="bg-rice-50 text-ink-700">
              <th className="p-3 border-b border-ink-200 font-semibold">Earnings</th>
              <th className="p-3 border-b border-ink-200 font-semibold text-right">Amount (₹)</th>
              <th className="p-3 border-b border-ink-200 font-semibold">Deductions</th>
              <th className="p-3 border-b border-ink-200 font-semibold text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3 border-b border-ink-100">Basic Salary</td>
              <td className="p-3 border-b border-ink-100 text-right font-data">{payroll.basicSalary.toLocaleString()}</td>
              <td className="p-3 border-b border-ink-100">{payroll.deductionReason || 'Other Deductions'}</td>
              <td className="p-3 border-b border-ink-100 text-right font-data">{payroll.deductions.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="p-3 border-b border-ink-100">Overtime / Bonus</td>
              <td className="p-3 border-b border-ink-100 text-right font-data">{payroll.bonus.toLocaleString()}</td>
              <td className="p-3 border-b border-ink-100"></td>
              <td className="p-3 border-b border-ink-100 text-right font-data"></td>
            </tr>
            <tr className="bg-rice-25 font-bold">
              <td className="p-3 border-b border-ink-200">Total Gross</td>
              <td className="p-3 border-b border-ink-200 text-right font-data">{payroll.grossSalary.toLocaleString()}</td>
              <td className="p-3 border-b border-ink-200">Total Deductions</td>
              <td className="p-3 border-b border-ink-200 text-right font-data">{payroll.deductions.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Net Salary */}
        <div className="flex justify-between items-center bg-leaf-50 p-6 rounded-lg mb-12">
          <div className="text-lg font-semibold text-leaf-800">Net Payable</div>
          <div className="text-3xl font-bold font-data text-leaf-900">₹{payroll.netSalary.toLocaleString()}</div>
        </div>

        {/* Footer */}
        <div className="flex justify-between mt-12 pt-8 border-t border-ink-200">
          <div className="text-center w-48">
            <div className="border-b border-ink-300 h-10 mb-2"></div>
            <p className="text-sm text-ink-500">Employer Signature</p>
          </div>
          <div className="text-center w-48">
            <div className="border-b border-ink-300 h-10 mb-2"></div>
            <p className="text-sm text-ink-500">Employee Signature</p>
          </div>
        </div>
        <p className="text-center text-xs text-ink-400 mt-8">
          This is a computer-generated document. Status: {payroll.status.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
