import { ReceiptText, CreditCard } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export function AdminAccountsPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Accounts & Billing"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Accounts' }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/payroll')} variant="secondary">
              Payroll Processing
            </Button>
            <Button onClick={() => navigate('/admin/payments')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Verify Payments
            </Button>
          </div>
        }
      />

      <Card className="p-12 text-center text-leaf-500">
        <ReceiptText className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-leaf-900 mb-2">Accounts Module</h3>
        <p>This section is under construction. Future updates will include invoice management and tax reporting.</p>
      </Card>
    </div>
  );
}
