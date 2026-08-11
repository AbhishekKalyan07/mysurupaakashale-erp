import { useNavigate } from 'react-router-dom';
import { useMealPlans } from '../hooks/useMealPlans';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useMySubscription } from '../hooks/useMySubscription';
import { Compass, Leaf, Soup, ChefHat, CheckCircle2, Coffee, Utensils, Moon, Bike, Clock, PauseCircle, ShieldCheck } from 'lucide-react';

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
    <div className="bg-[#FDFBF7] min-h-screen pt-4 pb-12 px-4 sm:px-6 lg:px-8 font-sans text-[#2D2323]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-4 mb-3">
            <Leaf className="text-[#C59A45] w-5 h-5 rotate-[20deg] opacity-70" />
            <h1 className="text-4xl font-serif font-bold text-[#2D2323]">Choose Your Plan</h1>
            <Leaf className="text-[#C59A45] w-5 h-5 -rotate-[20deg] opacity-70" />
          </div>
          <p className="text-[#6B5E5E] text-lg">Wholesome meals, delivered 3 times every day.</p>
        </div>

        {/* Cards Container */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto">
          {plans.map((plan) => {
            const isRegular = plan.tier === 'regular';
            const primaryColor = isRegular ? '#C59A45' : '#893131';
            const lightBg = isRegular ? '#F8F1E5' : '#F7EAE8';
            
            return (
              <div
                key={plan.id}
                className={`group relative flex flex-col rounded-3xl transition-all duration-300 hover:-translate-y-1 bg-white ${
                  isRegular 
                    ? 'border-2 border-[#C59A45] shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-5px_rgba(197,154,69,0.15)] mt-4 md:mt-0' 
                    : 'border border-[#EAE1D8] shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)]'
                }`}
              >
                {isRegular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C59A45] text-white text-[11px] font-bold px-4 py-1.5 rounded-full uppercase tracking-wider z-20 shadow-sm whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                {/* Image Header */}
                <div className="relative h-36 w-full bg-gray-200 rounded-t-[22px] overflow-hidden">
                  <img
                    src={isRegular ? 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&q=80&w=800&h=400' : 'https://images.unsplash.com/photo-1626776876729-bab4369a5a5a?auto=format&fit=crop&q=80&w=800&h=400'}
                    alt={plan.name}
                    className="w-full h-full object-cover"
                  />
                  {isRegular && <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>}
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-white p-2 rounded-full border-[4px] border-white shadow-sm" style={{ backgroundColor: primaryColor }}>
                    {isRegular ? <ChefHat className="w-5 h-5" /> : <Soup className="w-5 h-5" />}
                  </div>
                </div>

                {/* Card Content */}
                <div className="pt-6 px-5 pb-5 flex-1 flex flex-col">
                  <div className="text-center mb-3">
                    <h2 className="text-2xl font-serif mb-0.5" style={{ color: primaryColor }}>{plan.name}</h2>
                    <p className="text-sm text-[#6B5E5E] leading-snug">{plan.description || 'Including 3 times food with 3 times separate delivery.'}</p>
                  </div>

                  {/* Price Box */}
                  <div className="rounded-xl py-2 px-2 text-center mb-4" style={{ backgroundColor: lightBg }}>
                    <div className="flex items-baseline justify-center gap-1" style={{ color: primaryColor }}>
                      <span className="text-xl font-bold">₹</span>
                      <span className="text-4xl font-bold tracking-tight">{plan.pricePerDay}</span>
                      <span className="text-sm font-semibold uppercase">/ day</span>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5 opacity-80" style={{ color: primaryColor }}>
                      Billed Monthly (Includes 3 Deliveries)
                    </p>
                  </div>

                  {/* Features */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3 text-[#2D2323] font-semibold text-base">
                      <CheckCircle2 className="w-5 h-5" style={{ color: primaryColor }} />
                      What's Included
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                      <div>
                        <h4 className="font-semibold text-[15px] text-[#2D2323] flex items-center gap-1.5 mb-1"><Coffee className="w-4 h-4" style={{ color: primaryColor }} />Breakfast</h4>
                        <p className="text-[#6B5E5E] text-sm leading-tight">Daily rotating menu (Idli, dosa, upma, etc.)</p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-[15px] text-[#2D2323] flex items-center gap-1.5 mb-1"><Utensils className="w-4 h-4" style={{ color: primaryColor }} />Lunch Choices</h4>
                        <ul className={`text-[#6B5E5E] text-sm leading-tight list-disc pl-4 ${isRegular ? 'marker:text-[#C59A45]' : 'marker:text-[#893131]'}`}>
                          {plan.mealSlots?.find((s) => s.mealType === 'lunch')?.options.map((opt) => (
                            <li key={opt.id}>{opt.label}</li>
                          )) || (
                            <>
                              <li>Rice & Sambar</li>
                              <li>Ragi Ball</li>
                              <li>Chapati & Sagu</li>
                            </>
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold text-[15px] text-[#2D2323] flex items-center gap-1.5 mb-1"><Moon className="w-4 h-4" style={{ color: primaryColor }} />Dinner Choices</h4>
                        <ul className={`text-[#6B5E5E] text-sm leading-tight list-disc pl-4 ${isRegular ? 'marker:text-[#C59A45]' : 'marker:text-[#893131]'}`}>
                          {plan.mealSlots?.find((s) => s.mealType === 'dinner')?.options.map((opt) => (
                            <li key={opt.id}>{opt.label}</li>
                          )) || (
                            <>
                              <li>Rice & Sambar</li>
                              <li>Ragi Ball</li>
                              <li>Chapati & Palya</li>
                            </>
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold text-[15px] text-[#2D2323] flex items-center gap-1.5 mb-1"><Bike className="w-4 h-4" style={{ color: primaryColor }} />Delivery</h4>
                        <p className="text-[#6B5E5E] text-sm leading-tight">3 separate hot-deliveries per day</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-1">
                    <button
                      onClick={() => navigate('/customer/subscribe', { state: { planId: plan.id } })}
                      className={`w-full font-bold text-sm tracking-wide py-2.5 rounded-xl transition duration-200 ${
                        isRegular 
                          ? 'bg-[#C59A45] text-white hover:bg-yellow-600 shadow-md hover:shadow-lg'
                          : 'border-2 border-[#893131] text-[#893131] hover:bg-[#893131] hover:text-white'
                      }`}
                    >
                      CONFIGURE & SUBSCRIBE
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust Badges (Bottom) */}
        <div className="mt-12 pt-8 border-t border-[#EAE1D8] flex flex-wrap justify-center md:justify-between gap-6 px-4">
          <div className="flex items-center gap-3 w-[45%] md:w-auto">
            <div className="bg-green-50 p-2 rounded-lg text-green-700">
              <Leaf className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-[#2D2323]">100% Homemade</h5>
              <p className="text-[10px] text-[#6B5E5E] mt-0.5">Fresh & hygienic food prepared daily.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-[45%] md:w-auto">
            <div className="bg-orange-50 p-2 rounded-lg text-orange-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-[#2D2323]">On-Time Delivery</h5>
              <p className="text-[10px] text-[#6B5E5E] mt-0.5">Hot & timely delivery right to your door.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-[45%] md:w-auto">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-700">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-[#2D2323]">Pause Anytime</h5>
              <p className="text-[10px] text-[#6B5E5E] mt-0.5">Pause or resume your plan as per your need.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-[45%] md:w-auto">
            <div className="bg-[#F7EAE8] p-2 rounded-lg text-[#893131]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-[#2D2323]">No Contract</h5>
              <p className="text-[10px] text-[#6B5E5E] mt-0.5">Cancel anytime.<br />No hidden charges.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


