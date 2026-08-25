import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ShieldCheck, Mail, Utensils } from 'lucide-react';

interface DesktopAuthLayoutProps {
  children: ReactNode;
}

export function DesktopAuthLayout({ children }: DesktopAuthLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname.includes('signup');

  return (
    <main className="relative flex min-h-screen w-full overflow-hidden font-sans bg-[#fbf5ed] selection:bg-amber-200 selection:text-amber-900">

      {/* Full Screen Background */}
      <div className="absolute inset-0 pointer-events-none z-0 hidden md:block">
        <img
          src="/login-reference.webp"
          alt="Background"
          fetchpriority="high"
          loading="eager"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Subtle Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#5c1417_1px,transparent_1px)] [background-size:24px_24px] z-0" />

      {/* Centered Content Container */}
      <div className="relative z-10 flex flex-col w-full md:w-[450px] lg:w-[480px] px-6 lg:px-0 py-6 min-h-screen items-center justify-center mx-auto md:-translate-y-2 lg:-translate-y-4">

        {/* Header / Logo */}
        <div className="relative flex items-center justify-center w-full mb-0 shrink-0 z-20">
          {isSignup && (
            <button
              onClick={() => navigate('/login')}
              className="absolute left-0 lg:-left-4 top-1/2 -translate-y-1/2 text-[#2c150c] hover:text-[#5c1417] transition-colors p-2 bg-white/40 rounded-full backdrop-blur-sm"
              aria-label="Back"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}

          <div className="flex flex-col items-center">
            <img 
              src="/no_bg_logo.webp" 
              alt="Mysuru Paakashale Logo" 
              width="144"
              height="144"
              fetchpriority="high"
              loading="eager"
              className="h-28 md:h-32 lg:h-36 w-auto object-contain drop-shadow-sm" 
            />
          </div>
        </div>

        {/* Form Content (Moved up relative to logo) */}
        <div className="w-full flex flex-col justify-center -mt-4 md:-mt-6 lg:-mt-8 z-10">
          {children}
        </div>

        {/* Footer Trust Badges */}
        <div className="w-full flex mt-6 pt-4 border-t border-[#e8ded2]/60 items-center justify-between gap-2 text-[#5c4a42]">
          <div className="flex items-start gap-2 flex-1">
            <ShieldCheck className="w-5 h-5 mt-0.5 text-[#5c1417] shrink-0" strokeWidth={1.8} />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#2c150c]">Secure & Trusted</span>
              <span className="text-[10px] text-[#6e584f] leading-tight">Your data is protected</span>
            </div>
          </div>
          <div className="flex items-start gap-2 flex-1 justify-center">
            <Mail className="w-5 h-5 mt-0.5 text-[#5c1417] shrink-0" strokeWidth={1.8} />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#2c150c]">Email Verification</span>
              <span className="text-[10px] text-[#6e584f] leading-tight">For your security</span>
            </div>
          </div>
          <div className="flex items-start gap-2 flex-1 justify-end text-right">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-[#2c150c]">Fresh & Homemade</span>
              <span className="text-[10px] text-[#6e584f] leading-tight">Delivered with care</span>
            </div>
            <Utensils className="w-5 h-5 mt-0.5 text-[#5c1417] shrink-0" strokeWidth={1.8} />
          </div>
        </div>

      </div>
    </main>
  );
}
