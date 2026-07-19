import { LayoutGrid, Users, Settings, ShieldAlert } from 'lucide-react';
import { WelcomeCard } from '../components/WelcomeCard';
import { Card } from '@/shared/components/ui/Card';
import { useNavigate } from 'react-router-dom';

export function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <WelcomeCard
        icon={<LayoutGrid size={22} />}
        roleTagline="Run the whole kitchen: plans, staff, zones, and reporting."
        comingNext={[
          'Draw delivery zones on the map and assign kitchens',
          'Live dashboards for subscriptions, orders, and revenue',
        ]}
      />

      <div className="grid md:grid-cols-2 gap-4">
        <Card 
          className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex items-start gap-4 border-l-4 border-l-leaf-600"
          onClick={() => navigate('/admin/staff')}
        >
          <div className="p-3 bg-leaf-50 text-leaf-600 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink-900">Staff Management</h3>
            <p className="text-sm text-ink-500 mt-1">Provision and manage Kitchen, Delivery Partner, and Accounts staff roles.</p>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex items-start gap-4 border-l-4 border-l-ink-600"
          onClick={() => navigate('/admin/settings')}
        >
          <div className="p-3 bg-rice-100 text-ink-600 rounded-lg">
            <Settings size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink-900">Global Settings</h3>
            <p className="text-sm text-ink-500 mt-1">Configure delivery radius, operational holidays, and global parameters.</p>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex items-start gap-4 border-l-4 border-l-leaf-600"
          onClick={() => navigate('/admin/audit')}
        >
          <div className="p-3 bg-leaf-50 text-leaf-600 rounded-lg">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink-900">Audit Logs</h3>
            <p className="text-sm text-ink-500 mt-1">Review operational actions, payments, and workflow transitions.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
