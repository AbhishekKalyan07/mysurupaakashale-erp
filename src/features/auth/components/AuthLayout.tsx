import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
}

export function AuthLayout({ title, children }: AuthLayoutProps) {
  const navigate = useNavigate();

  return (
    <div 
      className="relative flex min-h-dvh items-center justify-center bg-cover bg-center px-4 py-12"
      style={{ backgroundImage: `url('/auth_bg.jpg')` }}
    >
      {/* Dimmed glass overlay behind the card */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" />

      {/* Centered Zomato-style Form Card */}
      <div className="relative w-full max-w-[430px] rounded-2xl bg-white p-6 shadow-2xl md:p-8">
        
        {/* Top-right 'x' Close button */}
        <button 
          onClick={() => navigate('/')}
          className="absolute right-5 top-5 text-ink-400 hover:text-ink-600 transition-colors p-1"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Form Title */}
        <h1 className="font-sans text-2xl font-medium text-ink-900 mb-6">
          {title}
        </h1>

        {/* Content body */}
        <div>{children}</div>
      </div>
    </div>
  );
}
