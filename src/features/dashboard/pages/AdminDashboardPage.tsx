import { LayoutGrid, Users, Settings, ShieldAlert, Activity, CreditCard, TrendingUp, Package } from 'lucide-react';
import { WelcomeCard } from '../components/WelcomeCard';
import { Card } from '@/shared/components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboardMetrics } from '../hooks/useAdminDashboardMetrics';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { mealPlanRepository } from '@/shared/services/firestore/mealPlanRepository';
import { toast } from 'react-hot-toast';
import { serverTimestamp, type Timestamp } from 'firebase/firestore';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data: metrics, isLoading } = useAdminDashboardMetrics();

  if (isLoading) return <LoadingScreen />;

  const handleSeedPlans = async () => {
    try {
      toast.loading('Seeding meal plans...', { id: 'seed' });
      const existing = await mealPlanRepository.list();
      for (const plan of existing) {
        if (plan.isActive) {
          await mealPlanRepository.update(plan.id, { isActive: false });
        }
      }

      await mealPlanRepository.create({
        tier: 'basic',
        name: 'Basic Plan',
        description: 'Including 3 times food with 3 times separate delivery.',
        pricePerDay: 159,
        currency: 'INR',
        deliveryIncluded: true,
        isActive: true,
        sortOrder: 1,
        mealSlots: [
          {
            mealType: 'breakfast',
            isCustomerSelectable: false,
            options: [
              {
                id: 'basic-breakfast-1',
                label: 'As Per Breakfast Menu',
                items: ['Breakfast Menu Item'],
              },
            ],
          },
          {
            mealType: 'lunch',
            isCustomerSelectable: true,
            options: [
              {
                id: 'basic-lunch-1',
                label: 'Rice & Sambar',
                items: ['Pickle', 'Rice', 'Sambar'],
              },
              {
                id: 'basic-lunch-2',
                label: 'Ragi Ball',
                items: ['1 Ragi Ball', 'Sambar', 'Buttermilk'],
              },
              {
                id: 'basic-lunch-3',
                label: 'Chapati & Sagu',
                items: ['3 Chapati', 'Sagu', 'Buttermilk'],
              },
            ],
          },
          {
            mealType: 'dinner',
            isCustomerSelectable: true,
            options: [
              {
                id: 'basic-dinner-1',
                label: 'Rice & Sambar',
                items: ['Rice', 'Sambar', 'Palya'],
              },
              {
                id: 'basic-dinner-2',
                label: 'Ragi Ball',
                items: ['1 Ragi Ball', 'Sambar', 'Palya'],
              },
              {
                id: 'basic-dinner-3',
                label: 'Chapati & Palya',
                items: ['3 Chapati', 'Palya'],
              },
            ],
          },
        ],
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      });

      await mealPlanRepository.create({
        tier: 'regular',
        name: 'Regular Plan',
        description: 'Including 3 times food with 3 times separate delivery.',
        pricePerDay: 210,
        currency: 'INR',
        deliveryIncluded: true,
        isActive: true,
        sortOrder: 2,
        mealSlots: [
          {
            mealType: 'breakfast',
            isCustomerSelectable: false,
            options: [
              {
                id: 'regular-breakfast-1',
                label: 'As Per Breakfast Menu',
                items: ['Breakfast Menu Item'],
              },
            ],
          },
          {
            mealType: 'lunch',
            isCustomerSelectable: true,
            options: [
              {
                id: 'regular-lunch-1',
                label: 'Ragi Ball Meal',
                items: ['Pickle', 'Rice', 'Sambar', '1 Ragi Ball', 'Buttermilk'],
              },
              {
                id: 'regular-lunch-2',
                label: 'Chapati Meal',
                items: ['Pickle', 'Rice', 'Sambar', '1 Chapati', 'Sagu/Palya', 'Buttermilk'],
              },
            ],
          },
          {
            mealType: 'dinner',
            isCustomerSelectable: true,
            options: [
              {
                id: 'regular-dinner-1',
                label: 'Chapati Meal',
                items: ['Rice', 'Sambar', '1 Chapati', 'Palya', 'Curd'],
              },
              {
                id: 'regular-dinner-2',
                label: 'Ragi Ball Meal',
                items: ['Rice', 'Sambar', '1 Ragi Ball', 'Curd'],
              },
            ],
          },
        ],
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      });

      toast.success('Meal plans seeded successfully!', { id: 'seed' });
    } catch (error: any) {
      toast.error('Error seeding plans: ' + error.message, { id: 'seed' });
    }
  };

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

      {/* Business Metrics Grid */}
      <div>
        <h2 className="text-xl font-bold text-ink-900 mb-4 flex items-center gap-2">
          <Activity className="text-leaf-600" size={24} /> 
          Real-time Business Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Total Customers"
            value={metrics?.totalCustomers ?? 0}
            icon={<Users className="text-blue-600" />}
            colorClass="bg-blue-50 border-blue-100"
          />
          <MetricCard
            title="Active Subscriptions"
            value={metrics?.activeSubscriptions ?? 0}
            icon={<CreditCard className="text-emerald-600" />}
            colorClass="bg-emerald-50 border-emerald-100"
          />
          <MetricCard
            title="Today's Total Orders"
            value={metrics?.todayOrders.total ?? 0}
            icon={<Package className="text-amber-600" />}
            colorClass="bg-amber-50 border-amber-100"
          />
          <MetricCard
            title="Pending Deliveries"
            value={metrics?.todayOrders.pending ?? 0}
            icon={<TrendingUp className="text-purple-600" />}
            colorClass="bg-purple-50 border-purple-100"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-ink-900 mb-4 flex items-center gap-2">
          <Settings className="text-ink-500" size={24} /> 
          Quick Actions & Configuration
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card 
            className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex flex-col gap-4 border-t-4 border-t-leaf-600"
            onClick={() => navigate('/admin/staff')}
          >
            <div className="p-3 bg-leaf-50 text-leaf-600 rounded-lg w-fit">
              <Users size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900">Staff Management</h3>
              <p className="text-sm text-ink-500 mt-1">Provision and manage Kitchen, Delivery, and Accounts staff roles.</p>
            </div>
          </Card>

          <Card 
            className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex flex-col gap-4 border-t-4 border-t-ink-600"
            onClick={() => navigate('/admin/settings')}
          >
            <div className="p-3 bg-rice-100 text-ink-600 rounded-lg w-fit">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900">Global Settings</h3>
              <p className="text-sm text-ink-500 mt-1">Configure delivery radius, operational holidays, and global parameters.</p>
            </div>
          </Card>

          <Card 
            className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex flex-col gap-4 border-t-4 border-t-leaf-600"
            onClick={() => navigate('/admin/audit')}
          >
            <div className="p-3 bg-leaf-50 text-leaf-600 rounded-lg w-fit">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900">Audit Logs</h3>
              <p className="text-sm text-ink-500 mt-1">Review operational actions, payments, and workflow transitions.</p>
            </div>
          </Card>

          <Card 
            className="p-6 cursor-pointer hover:shadow-card-hover transition-all flex flex-col gap-4 border-t-4 border-t-purple-600 bg-purple-50/50"
            onClick={handleSeedPlans}
          >
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg w-fit">
              <Package size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900">Seed Meal Plans</h3>
              <p className="text-sm text-ink-500 mt-1">Updates database with the exact Basic (159/day) and Regular (210/day) plans.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, colorClass }: { title: string; value: number; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className={`p-5 rounded-2xl border ${colorClass} flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="bg-white p-2 w-fit rounded-lg shadow-sm border border-black/5">
        {icon}
      </div>
      <div>
        <h4 className="text-3xl font-display font-bold text-ink-900 leading-tight">{value}</h4>
        <p className="text-sm text-ink-600 font-medium mt-1">{title}</p>
      </div>
    </div>
  );
}
