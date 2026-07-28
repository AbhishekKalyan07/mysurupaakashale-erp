import { useNavigate } from 'react-router-dom';
import { useMealPlans } from '../hooks/useMealPlans';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useMySubscription } from '../hooks/useMySubscription';
import { Compass, ShieldCheck, Check } from 'lucide-react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

export function BrowsePlansPage() {
  const { data: plans, isLoading: isPlansLoading, error, refetch } = useMealPlans();
  const { data: activeSub, isLoading: isSubLoading } = useMySubscription();
  const navigate = useNavigate();

  if (isPlansLoading || isSubLoading) {
    return <LoadingScreen />;
  }

  if (activeSub && activeSub.status !== 'cancelled' && activeSub.status !== 'expired') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={<Compass size={48} className="text-primary/40" />}
          title="Active Subscription Exists"
          description="You already have an active or pending meal plan. You must cancel your current plan before switching to a new one."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <ErrorState
          title="Could not load plans"
          description="We had trouble retrieving the meal plans. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={<Compass size={48} className="text-primary/40" />}
          title="No Active Plans"
          description="There are currently no active subscription plans available for signup."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-display text-primary font-bold mb-3">
          Choose Your Meal Plan
        </h1>
        <p className="text-text-muted text-sm md:text-base font-sans max-w-2xl mx-auto">
          Select the plan that best fits your lifestyle and dietary preferences.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
        {plans.map((plan) => {
          const isRegular = plan.tier === 'regular';
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col overflow-hidden rounded-2xl bg-card transition-all duration-300 ${
                isRegular
                  ? 'border-2 border-gold shadow-lg shadow-gold/10 md:-translate-y-4'
                  : 'border border-primary/10 shadow-md hover:shadow-lg hover:border-primary/20'
              }`}
            >
              {isRegular && (
                <div className="bg-gold text-primary text-center py-2 text-[10px] font-bold uppercase tracking-widest font-sans shadow-sm">
                  Most Popular Choice
                </div>
              )}

              <div className="p-8 flex flex-col flex-1">
                {/* Header */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-display font-bold text-primary mb-2">
                    {plan.name}
                  </h2>
                  <p className="text-text-muted text-sm font-sans">
                    {plan.description}
                  </p>
                </div>

                {/* Pricing Box */}
                <div className={`mb-8 p-6 rounded-xl border flex flex-col items-center justify-center ${
                  isRegular ? 'bg-gold/5 border-gold/20' : 'bg-primary/5 border-primary/10'
                }`}>
                  <div className="flex items-baseline justify-center font-sans">
                    <span className="text-4xl font-extrabold font-data text-primary tracking-tight">
                      ₹{plan.pricePerDay}
                    </span>
                    <span className="text-text-muted ml-2 text-sm font-bold uppercase">
                      / day
                    </span>
                  </div>
                  <p className="text-xs text-text-muted font-sans mt-2 font-medium uppercase tracking-wider text-center">
                    Billed monthly (includes 3 deliveries)
                  </p>
                </div>

                {/* Features */}
                <div className="flex-1 mb-8">
                  <h3 className="text-primary font-bold font-sans mb-4 flex items-center gap-2 text-base border-b border-primary/10 pb-3">
                    <ShieldCheck size={20} className="text-gold" /> What's Included
                  </h3>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-6 font-sans text-base text-text-muted">
                    <li className="flex items-start gap-3">
                      <Check size={18} className="text-gold shrink-0 mt-0.5" />
                      <span className="leading-relaxed">
                        <strong className="text-primary block mb-1">Breakfast</strong>
                        <span className="text-sm">Daily rotating menu (idli, dosa, upma, etc.)</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check size={18} className="text-gold shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="text-primary block mb-1">Lunch Choices</strong>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {plan.mealSlots
                            ?.find((s) => s.mealType === 'lunch')
                            ?.options.map((opt) => (
                              <li key={opt.id}>{opt.label}</li>
                            ))}
                        </ul>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check size={18} className="text-gold shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="text-primary block mb-1">Dinner Choices</strong>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {plan.mealSlots
                            ?.find((s) => s.mealType === 'dinner')
                            ?.options.map((opt) => (
                              <li key={opt.id}>{opt.label}</li>
                            ))}
                        </ul>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check size={18} className="text-gold shrink-0 mt-0.5" />
                      <span className="leading-relaxed">
                        <strong className="text-primary block mb-1">Delivery</strong>
                        <span className="text-sm">3 separate hot-deliveries per day</span>
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Action */}
                <div className="mt-auto pt-4">
                  <Button
                    onClick={() => navigate('/customer/subscribe', { state: { planId: plan.id } })}
                    className={`w-full font-bold py-3 font-sans uppercase tracking-widest text-xs transition-all shadow-md hover:shadow-lg ${
                      isRegular 
                        ? 'bg-gold hover:bg-yellow-500 text-primary border-none' 
                        : ''
                    }`}
                    variant={isRegular ? 'primary' : 'secondary'}
                  >
                    Configure & Subscribe
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

