import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ShieldCheck, Mail, Utensils } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname.includes('signup');

  return (
    <div className="relative flex min-h-dvh flex-col bg-rice-50 overflow-hidden selection:bg-turmeric-200 selection:text-leaf-900 font-sans">
      
      {/* Absolute Tiffin Image (Anchored right, blended into background) */}
      <div className="absolute top-0 right-0 w-full md:w-[600px] h-[500px] pointer-events-none opacity-90 z-0">
        <img 
          src="/auth_bg.jpg" 
          alt="Tiffin Box" 
          className="w-full h-full object-cover object-left mix-blend-multiply [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_70%)]"
        />
      </div>

      {/* Subtle traditional watermark grid element (optional, keeping opacity extremely low so it doesn't distract from the clean mockup) */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(var(--color-leaf-900)_1px,transparent_1px)] [background-size:24px_24px] z-0" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-grow w-full max-w-md mx-auto px-6 py-8">
        
        {/* Header Section */}
        <div className="relative flex items-center justify-center w-full mb-8 pt-4">
          {/* Back Arrow (Visible on Signup or based on mockup) */}
          {isSignup && (
            <button 
              onClick={() => navigate('/login')}
              className="absolute left-0 text-ink-900 hover:text-leaf-700 transition-colors p-1"
              aria-label="Back"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}

          {/* Logo */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
              <img src="/favicon.svg" alt="Logo" className="h-8 w-8 text-leaf-700" />
              <span className="font-display text-2xl font-bold text-leaf-700 tracking-wide">
                MYSURU<br/><span className="text-xl">PAAKASHALE</span>
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="h-px w-6 bg-ink-300"></div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-700">
                Real Taste of Nammuru
              </p>
              <div className="h-px w-6 bg-ink-300"></div>
            </div>
          </div>
        </div>

        {/* Content Body (Form) */}
        <div className="flex-grow mt-4 flex flex-col justify-center">
          {children}
        </div>
        
        {/* Footer Trust Badges */}
        <div className="mt-12 pt-6 flex items-center justify-between gap-2 text-ink-700">
          
          <div className="flex items-start gap-2 flex-1">
            <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-ink-900">Secure & Trusted</span>
              <span className="text-[9px] text-ink-500 leading-tight">Your data is protected</span>
            </div>
          </div>

          <div className="flex items-start gap-2 flex-1 justify-center">
            <Mail className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-ink-900">Email Verification</span>
              <span className="text-[9px] text-ink-500 leading-tight">For your security</span>
            </div>
          </div>

          <div className="flex items-start gap-2 flex-1 justify-end text-right">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-ink-900">Fresh & Homemade</span>
              <span className="text-[9px] text-ink-500 leading-tight">Delivered with care</span>
            </div>
            <Utensils className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.5} />
          </div>

        </div>

      </div>
    </div>
  );
}
