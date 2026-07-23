import { ChefHat } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useGenerateOrders } from '../hooks/useGenerateOrders';

export function AdminKitchenPage() {
  const navigate = useNavigate();
  const { generateOrders, isGenerating } = useGenerateOrders();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Kitchen Operations"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Kitchen Operations' }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/menus')} variant="secondary">
              Manage Daily Menus
            </Button>
            <Button onClick={generateOrders} isLoading={isGenerating}>
              Generate Today's Orders
            </Button>
          </div>
        }
      />

      <Card className="p-12 text-center text-leaf-500">
        <ChefHat className="mx-auto mb-4 text-leaf-300" size={48} />
        <h3 className="text-lg font-medium text-leaf-900 mb-2">Kitchen Module</h3>
        <p>This section is under construction. Future updates will include meal production tracking.</p>
      </Card>
    </div>
  );
}
