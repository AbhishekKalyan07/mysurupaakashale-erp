import { Users, Settings, ShieldAlert, Activity, CreditCard, TrendingUp, Package, PackageOpen } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PremiumCard } from '@/shared/components/ui/PremiumCard';
import { PremiumButton } from '@/shared/components/ui/PremiumButton';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboardMetrics } from '../hooks/useAdminDashboardMetrics';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { mealPlanRepository } from '@/shared/services/firestore/mealPlanRepository';
import { toast } from 'react-hot-toast';
import { serverTimestamp, type Timestamp } from 'firebase/firestore';
import { useAutomatedDailyOrders } from '@/features/admin/hooks/useAutomatedDailyOrders';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: metrics, isLoading } = useAdminDashboardMetrics();

  const firstName = profile?.fullName?.split(' ')[0] || 'Admin';

  // Triggers daily order generation invisibly in the background if it hasn't run today
  useAutomatedDailyOrders();

  if (isLoading) return <LoadingScreen />;

  const handleSeedPlans = async () => {
    if (!window.confirm('Are you sure you want to seed the default meal plans? This will deactivate any currently active plans.')) {
      return;
    }
    
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
        createdAt: serverTimestamp() as unknown as Timestamp as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp as Timestamp,
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
        createdAt: serverTimestamp() as unknown as Timestamp as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp as Timestamp,
      });

      toast.success('Meal plans seeded successfully!', { id: 'seed' });
    } catch (error: unknown) {
      toast.error('Error seeding plans: ' + (error as Error).message, { id: 'seed' });
    }
  };

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName={firstName}
        subtitle="Run the whole kitchen: plans, staff, zones, and reporting."
        actions={
          <PremiumButton variant="secondary" onClick={() => navigate('/admin/settings')}>
            <Settings size={18} />
            Global Settings
          </PremiumButton>
        }
      />

      <div>
        <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
          <Activity className="text-gold" size={24} /> 
          Real-time Business Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <MetricCard
            title="Total Customers"
            value={metrics?.totalCustomers ?? 0}
            icon={<Users size={24} />}
            color="blue"
          />
          <MetricCard
            title="Active Subscriptions"
            value={metrics?.activeSubscriptions ?? 0}
            icon={<CreditCard size={24} />}
            color="mint"
          />
          <MetricCard
            title="Today's Total Orders"
            value={metrics?.todayOrders.total ?? 0}
            icon={<Package size={24} />}
            color="amber"
          />
          <MetricCard
            title="Pending Deliveries"
            value={metrics?.todayOrders.pending ?? 0}
            icon={<TrendingUp size={24} />}
            color="lavender"
          />
          <MetricCard
            title="Low Stock Items"
            value={metrics?.lowStockItems ?? 0}
            icon={<PackageOpen size={24} className="text-danger" />}
            color="rose"
          />
          <MetricCard
            title="Open Complaints"
            value={metrics?.openComplaints ?? 0}
            icon={<ShieldAlert size={24} className="text-warning" />}
            color="cream"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
          <Settings className="text-text-muted" size={24} /> 
          Quick Actions & Configuration
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <PremiumCard hoverLift className="cursor-pointer" onClick={() => navigate('/admin/staff')}>
            <div className="p-3 bg-pastel-blue text-primary rounded-xl w-fit mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Staff Management</h3>
            <p className="text-sm text-text-muted mt-2">Provision and manage Kitchen, Delivery, and Accounts staff roles.</p>
          </PremiumCard>

          <PremiumCard hoverLift className="cursor-pointer" onClick={() => navigate('/admin/settings')}>
            <div className="p-3 bg-pastel-mint text-primary rounded-xl w-fit mb-4">
              <Settings size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Global Settings</h3>
            <p className="text-sm text-text-muted mt-2">Configure delivery radius, operational holidays, and global parameters.</p>
          </PremiumCard>

          <PremiumCard hoverLift className="cursor-pointer" onClick={() => navigate('/admin/audit')}>
            <div className="p-3 bg-pastel-amber text-primary rounded-xl w-fit mb-4">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Audit Logs</h3>
            <p className="text-sm text-text-muted mt-2">Review operational actions, payments, and workflow transitions.</p>
          </PremiumCard>

          <PremiumCard hoverLift className="cursor-pointer bg-gradient-to-br from-white to-pastel-lavender" onClick={handleSeedPlans}>
            <div className="p-3 bg-white text-primary rounded-xl shadow-sm w-fit mb-4">
              <Package size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Seed Meal Plans</h3>
            <p className="text-sm text-text-muted mt-2">Updates database with the exact Basic (159/day) and Regular (210/day) plans.</p>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}
