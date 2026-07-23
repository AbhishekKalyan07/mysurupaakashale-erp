import { ReceiptText } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export function AdminAccountsPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <ReceiptText className="text-leaf-600" />
          Accounts & Billing
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          Manage customer payments, billing, and staff payroll.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-6 flex flex-col items-center text-center">
          <ReceiptText className="mb-4 text-leaf-500" size={32} />
          <h3 className="text-lg font-medium text-ink-900 mb-2">Payment Verification</h3>
          <p className="text-ink-500 mb-6 flex-1">Verify manual and offline customer payments.</p>
          <Button onClick={() => navigate('/admin/payments')} className="w-full">View Payments</Button>
        </Card>
        
        <Card className="p-6 flex flex-col items-center text-center">
          <ReceiptText className="mb-4 text-leaf-500" size={32} />
          <h3 className="text-lg font-medium text-ink-900 mb-2">Staff Payroll</h3>
          <p className="text-ink-500 mb-6 flex-1">Manage salary profiles and generate payslips.</p>
          <Button onClick={() => navigate('/admin/payroll')} className="w-full">View Payroll</Button>
        </Card>
      </div>
    </div>
  );
}
