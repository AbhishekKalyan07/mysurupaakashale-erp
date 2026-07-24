import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-[#FDFBF7] px-4 py-8 md:py-16 selection:bg-[#801C1E]/10 selection:text-[#801C1E]">
      
      {/* Subtle traditional watermark grid element */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#801C1E_1px,transparent_1px)] [background-size:16px_16px]" />
      
      {/* Top-left back link */}
      <button 
        onClick={() => navigate('/')}
        className="absolute left-4 top-4 flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-[#801C1E] transition-colors"
      >
        <ChevronLeft size={16} />
        <span>Home</span>
      </button>

      {/* Centered card frame */}
      <div className="relative w-full max-w-[430px] rounded-2xl bg-white border border-[#E6E1D4]/60 p-6 shadow-card hover:shadow-card-hover transition-shadow md:p-8">
        
        {/* Branding Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <img src="/favicon.svg" alt="Logo" className="h-9 w-9 text-[#801C1E]" />
            <span className="font-display text-2xl font-bold text-[#801C1E]">
              Mysuru Paakashale
            </span>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-500 font-sans">
            Homemade Food Delivered Fresh
          </p>
        </div>

        {/* Tiffin Banner */}
        <div className="relative h-40 w-full rounded-xl overflow-hidden mb-6 border border-[#E6E1D4]/40">
          <img 
            src="/auth_bg.jpg" 
            alt="Mysuru Paakashale Tiffin Box" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        {/* Form Body */}
        <div>{children}</div>
        
        {/* Trust Indicators */}
        <div className="mt-8 pt-6 border-t border-[#E6E1D4]/60 flex flex-col gap-2.5 text-xs text-ink-500 font-sans">
          <div className="flex items-center gap-2">
            <span className="text-[#801C1E]">🔒</span>
            <span className="font-medium text-ink-600">Secure authentication powered by Firebase</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#801C1E]">📧</span>
            <span className="font-medium text-ink-600">Email verification required</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#801C1E]">🔐</span>
            <span className="font-medium text-ink-600">Your data is protected</span>
          </div>
        </div>

      </div>
    </div>
  );
}
