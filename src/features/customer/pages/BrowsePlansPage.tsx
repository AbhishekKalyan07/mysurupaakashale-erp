import { useNavigate } from 'react-router-dom';
import { useMealPlans } from '../hooks/useMealPlans';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Compass, ShieldCheck, Check } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';

export function BrowsePlansPage() {
  const { data: plans, isLoading, error, refetch } = useMealPlans();
  const navigate = useNavigate();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load plans"
        description="We had trouble retrieving the meal plans. Please try again."
        onRetry={refetch}
      />
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <EmptyState
        icon={<Compass size={32} />}
        title="No Active Plans"
        description="There are currently no active subscription plans available for signup."
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif text-amber-950 font-bold mb-4">
          Choose Your Meal Plan
        </h1>
        <p className="text-ink-600 max-w-2xl mx-auto text-lg font-sans">
          Fresh, healthy, and hygienic home-style Karnataka meals delivered hot and fresh directly to your door three times a day.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-stretch max-w-4xl mx-auto">
        {plans.map((plan) => {
          const isRegular = plan.tier === 'regular';
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col justify-between overflow-hidden border-2 transition-all hover:shadow-xl ${
                isRegular
                  ? 'border-emerald-600 shadow-md bg-rice-50/50'
                  : 'border-rice-300'
              }`}
            >
              {isRegular && (
                <div className="absolute top-0 right-0 left-0 bg-emerald-600 text-stone-50 py-1.5 text-center text-xs font-semibold uppercase tracking-wider font-sans">
                  Most Popular choice
                </div>
              )}

              <div className={`p-6 md:p-8 ${isRegular ? 'pt-10' : ''}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-ink-900">{plan.name}</h2>
                    <p className="text-ink-500 text-sm font-sans mt-1">{plan.description}</p>
                  </div>
                  <Badge tone={isRegular ? 'success' : 'neutral'} className="uppercase font-sans font-semibold tracking-wider text-xs">
                    {plan.tier}
                  </Badge>
                </div>

                <div className="my-6">
                  <div className="flex items-baseline font-sans">
                    <span className="text-4xl font-extrabold text-ink-900">₹{plan.pricePerDay}</span>
                    <span className="text-ink-500 ml-2 text-base">/ day</span>
                  </div>
                  <p className="text-xs text-ink-400 font-sans mt-1">Billed monthly (includes 3 deliveries daily)</p>
                </div>

                <div className="border-t border-rice-300/80 my-6 pt-6">
                  <h3 className="text-ink-800 font-semibold font-sans mb-4 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-600" /> What's Included:
                  </h3>
                  <ul className="space-y-3 font-sans text-ink-600 text-sm">
                    <li className="flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Breakfast:</strong> Daily rotating menu (idli, dosa, upma, etc.)</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Lunch Choices:</strong> Select from:
                        <ul className="list-disc list-inside mt-1 pl-2 text-ink-500 text-xs space-y-1">
                          {plan.mealSlots
                            ?.find((s) => s.mealType === 'lunch')
                            ?.options.map((opt) => (
                              <li key={opt.id}>{opt.label}</li>
                            ))}
                        </ul>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Dinner Choices:</strong> Select from:
                        <ul className="list-disc list-inside mt-1 pl-2 text-ink-500 text-xs space-y-1">
                          {plan.mealSlots
                            ?.find((s) => s.mealType === 'dinner')
                            ?.options.map((opt) => (
                              <li key={opt.id}>{opt.label}</li>
                            ))}
                        </ul>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Delivery:</strong> 3 separate hot-deliveries per day</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-6 md:p-8 pt-0">
                <Button
                  onClick={() => navigate('/customer/subscribe', { state: { planId: plan.id } })}
                  className="w-full font-semibold py-3 font-sans uppercase tracking-wider text-sm transition-all"
                  variant={isRegular ? 'primary' : 'secondary'}
                >
                  Configure & Subscribe
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
