import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function MobileAuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname.includes("signup");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-y-auto selection:bg-turmeric-200 selection:text-leaf-900 font-sans bg-[#fdf7f0]">
      {/* Mobile Background Image */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "url('/mobile_ui_loginbg.webp')",
          backgroundSize: "100% auto",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
      />

      {/* Subtle traditional watermark grid element (optional, keeping opacity extremely low) */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(var(--color-leaf-900)_1px,transparent_1px)] [background-size:24px_24px] z-0" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-grow w-full max-w-md mx-auto px-5 sm:px-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {/* Header Section */}
        <div className="relative flex items-center justify-between w-full min-h-[3rem] mb-0 pt-1 shrink-0">
          {/* Back Arrow (Visible on Signup) */}
          {isSignup ? (
            <button
              onClick={() => navigate("/login")}
              className="text-ink-900 hover:text-leaf-700 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
              aria-label="Back"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Content Body */}
        <div className="flex-grow mt-0 flex flex-col justify-center my-auto">
          {children}
        </div>
      </div>
    </main>
  );
}
