import { ChefHat } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export function AdminKitchenPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
          <ChefHat className="text-leaf-600" />
          Kitchen Management
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          Oversee daily menus and kitchen production operations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 flex flex-col items-center text-center">
          <ChefHat className="mb-4 text-leaf-500" size={32} />
          <h3 className="text-lg font-medium text-ink-900 mb-2">Daily Menus</h3>
          <p className="text-ink-500 mb-6 flex-1">Manage what is being cooked for each meal slot daily.</p>
          <Button onClick={() => navigate('/admin/menus')} className="w-full">Manage Menus</Button>
        </Card>
        
        <Card className="p-6 flex flex-col items-center text-center opacity-75">
          <ChefHat className="mb-4 text-leaf-300" size={32} />
          <h3 className="text-lg font-medium text-ink-900 mb-2">Production Board</h3>
          <p className="text-ink-500 mb-6 flex-1">Monitor live kitchen prep and cooking progress.</p>
          <Button variant="secondary" disabled className="w-full">Coming Soon</Button>
        </Card>
      </div>
    </div>
  );
}
