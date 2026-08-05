import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function MobileAuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname.includes('signup');

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden selection:bg-turmeric-200 selection:text-leaf-900 font-sans bg-[#fdf7f0]">
      {/* Mobile Background Image */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "url('/mobile_ui_loginbg.webp')",
          backgroundSize: '100% auto',
          backgroundPosition: 'top center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      />
      
      {/* Subtle traditional watermark grid element (optional, keeping opacity extremely low) */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(var(--color-leaf-900)_1px,transparent_1px)] [background-size:24px_24px] z-0" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-grow w-full max-w-md mx-auto px-6 py-4">
        
        {/* Header Section (Small spacer to allow form to fit on screen) */}
        <div className="relative flex items-center justify-center w-full min-h-[6rem] mb-2 pt-2 shrink-0">
          {/* Back Arrow (Visible on Signup or based on mockup) */}
          {isSignup && (
            <button 
              onClick={() => navigate('/login')}
              className="absolute left-0 top-4 text-ink-900 hover:text-leaf-700 transition-colors p-1"
              aria-label="Back"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Content Body (Form) */}
        <div className="flex-grow mt-4 flex flex-col justify-center">
          {children}
        </div>
      </div>
    </main>
  );
}
