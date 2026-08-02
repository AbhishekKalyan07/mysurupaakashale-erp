import { Users, Activity, Settings, ShieldAlert, CreditCard, Package, PackageOpen, IndianRupee, ChefHat, Truck, AlertTriangle, XCircle } from 'lucide-react';
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
import { getDocs, query, collection, where, writeBatch } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';

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

  const handlePatchOrders = async () => {
    if (!window.confirm('Are you sure you want to patch todays orders?')) return;
    try {
      toast.loading('Patching orders...', { id: 'patch' });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const ordersSnap = await getDocs(query(collection(db, 'orders'), where('date', '==', today), where('source', '==', 'subscription')));
      const plansSnap = await getDocs(collection(db, 'mealPlans'));
      const mealPlans = plansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const subsSnap = await getDocs(collection(db, 'subscriptions'));
      const subscriptions = new Map(subsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() as any }]));

      const batch = writeBatch(db);
      let count = 0;

      for (const docSnap of ordersSnap.docs) {
        const order = docSnap.data() as any;
        const sub = subscriptions.get(order.subscriptionId);
        
        if (sub) {
          const price = Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / (sub.mealPreferences?.length || 1));
          
          const pref = sub.mealPreferences?.find((p: any) => p.mealType === order.mealType);
          let optionLabel = '';
          const plan = mealPlans.find((p: any) => p.id === sub.planId);
          if (plan) {
            const slot = plan.mealSlots?.find((s: any) => s.mealType === pref?.mealType);
            let option = slot?.options?.find((o: any) => o.id === pref?.selectedOptionId);
            if (!option && slot?.options?.length > 0) {
              option = slot.options[0]; // Fallback to first option if missing
            }
            if (option) optionLabel = ` (${option.label})`;
          }
          const itemsLabel = `Subscription - ${order.mealType}${optionLabel}`;

          if (order.price !== price || order.itemsLabel !== itemsLabel) {
            batch.update(docSnap.ref, { price, itemsLabel });
            count++;
          }
        }
      }

      if (count > 0) {
        await batch.commit();
        toast.success(`Successfully patched ${count} orders!`, { id: 'patch' });
      } else {
        toast.success('No orders needed patching.', { id: 'patch' });
      }
    } catch (error: any) {
      toast.error('Error patching orders: ' + error.message, { id: 'patch' });
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <MetricCard
            title="System Status"
            value={metrics?.systemStatus === 'healthy' ? 'Healthy' : 'Degraded'}
            icon={<ShieldAlert size={24} />}
            color={metrics?.systemStatus === 'healthy' ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Total Customers"
            value={metrics?.totalCustomers ?? 0}
            icon={<Users size={24} />}
            color="blue"
          />
          <MetricCard
            title="Active Drivers"
            value={metrics?.activeDrivers ?? 0}
            icon={<Truck size={24} />}
            color="lavender"
          />
          <MetricCard
            title="Active Subs"
            value={metrics?.activeSubscriptions ?? 0}
            icon={<CreditCard size={24} />}
            color="mint"
          />
          <MetricCard
            title="Revenue Today"
            value={`₹${metrics?.revenueToday?.toLocaleString() ?? 0}`}
            icon={<IndianRupee size={24} />}
            color="gold"
          />
          <MetricCard
            title="Total Orders"
            value={metrics?.todayOrders.total ?? 0}
            icon={<Package size={24} />}
            color="amber"
          />
          <MetricCard
            title="Pending Orders"
            value={metrics?.todayOrders.pending ?? 0}
            icon={<AlertTriangle size={24} />}
            color="rose"
          />
          <MetricCard
            title="Kitchen SLA"
            value={`${metrics?.kitchenSLA ?? 100}%`}
            icon={<ChefHat size={24} />}
            color={(metrics?.kitchenSLA ?? 100) >= 95 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Delivery SLA"
            value={`${metrics?.deliverySLA ?? 100}%`}
            icon={<PackageOpen size={24} />}
            color={(metrics?.deliverySLA ?? 100) >= 95 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Failed Deliveries"
            value={metrics?.todayOrders.failedDeliveries ?? 0}
            icon={<XCircle size={24} />}
            color={(metrics?.todayOrders.failedDeliveries ?? 0) === 0 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Failed Payments"
            value={metrics?.failedPayments ?? 0}
            icon={<XCircle size={24} />}
            color={(metrics?.failedPayments ?? 0) === 0 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Open Complaints"
            value={metrics?.openComplaints ?? 0}
            icon={<ShieldAlert size={24} className={metrics?.openComplaints ? "text-warning" : ""} />}
            color={(metrics?.openComplaints ?? 0) === 0 ? 'mint' : 'amber'}
            onClick={() => navigate('/admin/complaints')}
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
          
          <PremiumCard hoverLift className="cursor-pointer bg-gradient-to-br from-white to-pastel-blue" onClick={handlePatchOrders}>
            <div className="p-3 bg-white text-primary rounded-xl shadow-sm w-fit mb-4">
              <Activity size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Fix Today's Orders</h3>
            <p className="text-sm text-text-muted mt-2">Patches the item labels and price splits for today's orders.</p>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}
