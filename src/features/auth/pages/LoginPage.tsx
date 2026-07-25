import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ShieldCheck, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';

import { signIn, signInWithGoogle, mapAuthError, resetPassword } from '../services/authService';
import type { LoginFormValues } from '../types/auth.types';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  
  const [showPassword, setShowPassword] = useState(false);
  
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      const from = (location.state as { from?: Location } | null)?.from;
      navigate(from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    }
  };

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return;
    setFormError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      const from = (location.state as { from?: Location } | null)?.from;
      navigate(from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(resetEmail.trim());
      toast.success('Password reset link sent to your email!');
      setForgotPasswordMode(false);
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#FAF6F0] font-sans selection:bg-[#6A1B1A]/10 selection:text-[#6A1B1A] overflow-hidden">
      
      {/* Background Hero Image - Full screen to handle the blending effect shown in mockup */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
        <img 
          src="/auth_bg.jpg" 
          alt="Background" 
          className="w-full h-full object-cover opacity-100"
          onError={(e) => {
            // Safe fallback if auth_bg.jpg is missing
            e.currentTarget.style.display = 'none';
          }}
        />
        {/* Soft gradient to ensure text readability if the image isn't perfectly faded */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF6F0] via-[#FAF6F0]/90 to-transparent lg:to-transparent" />
      </div>

      {/* Main Content Wrapper */}
      <div className="relative z-10 w-full max-w-[460px] px-6 py-10 flex flex-col items-center justify-center animate-in fade-in duration-700 zoom-in-95">
        
        {/* Logo */}
        <div className="mb-8 w-full flex justify-center">
          <img 
            src="/logo.png" 
            alt="Mysuru Paakashale Logo" 
            className="h-16 md:h-20 w-auto object-contain"
            onError={(e) => {
              // Fallback to text logo if image fails
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('div.fallback-logo')) {
                const fallback = document.createElement('div');
                fallback.className = 'fallback-logo text-center';
                fallback.innerHTML = `<span class="font-display text-2xl font-bold text-[#6A1B1A] tracking-wide">MYSURU<br/><span class="text-xl">PAAKASHALE</span></span><div class="flex items-center justify-center gap-2 mt-1"><div class="h-px w-6 bg-ink-300"></div><p class="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-700">Real Taste of Nammuru</p><div class="h-px w-6 bg-ink-300"></div></div>`;
                parent.appendChild(fallback);
              }
            }}
          />
        </div>

        {forgotPasswordMode ? (
          <form onSubmit={handleResetPassword} className="w-full flex flex-col items-center">
            <h2 className="text-[28px] font-bold text-[#6A1B1A] mb-2 text-center tracking-tight">
              Reset Password
            </h2>
            <p className="text-[14px] text-[#2B2B2B]/70 font-medium text-center mb-8 max-w-[320px]">
              Enter your email address to receive a secure reset link.
            </p>

            <div className="w-full flex flex-col gap-4 mb-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2B2B2B]/40 pointer-events-none">
                  <Mail size={18} strokeWidth={2} />
                </div>
                <input
                  type="email"
                  placeholder="Email address"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="h-[52px] w-full rounded-xl border border-[#E5E0D8] bg-white pl-11 pr-4 text-[15px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-200 focus:outline-none focus:border-[#6A1B1A] focus:ring-1 focus:ring-[#6A1B1A] shadow-sm"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="text-[13px] text-red-600 font-medium w-full text-center mb-4">
                {formError}
              </p>
            )}

            <button 
              type="submit" 
              disabled={resetLoading}
              className="w-full h-[52px] rounded-xl bg-[#6A1B1A] text-white text-[16px] font-semibold transition-all duration-200 hover:bg-[#5a1615] flex items-center justify-center shadow-md disabled:opacity-70"
            >
              {resetLoading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                'Send Reset Link'
              )}
            </button>

            <button 
              type="button" 
              onClick={() => { setForgotPasswordMode(false); setFormError(null); }}
              className="mt-6 text-[14px] font-semibold text-[#6A1B1A] hover:underline"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="w-full flex flex-col items-center">
            
            <h2 className="text-[28px] font-bold text-[#6A1B1A] mb-2 text-center tracking-tight flex items-center justify-center gap-2">
              Welcome Back <span className="text-2xl leading-none">👋</span>
            </h2>
            <p className="text-[14px] text-[#2B2B2B]/70 font-medium text-center mb-8 max-w-[320px]">
              Sign in to continue and manage your meal subscription with us.
            </p>

            <div className="w-full flex flex-col gap-4">
              
              {/* Email Input */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2B2B2B]/40 pointer-events-none">
                  <Mail size={18} strokeWidth={2} />
                </div>
                <input
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  className={`h-[52px] w-full rounded-xl border ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-[#E5E0D8] focus:border-[#6A1B1A] focus:ring-[#6A1B1A]'} bg-white pl-11 pr-4 text-[15px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-200 focus:outline-none focus:ring-1 shadow-sm`}
                  {...register('email')}
                />
                {errors.email && (
                  <p role="alert" className="text-[13px] text-red-600 font-medium absolute -bottom-5 left-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div className="relative mt-2">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2B2B2B]/40 pointer-events-none">
                  <Lock size={18} strokeWidth={2} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className={`h-[52px] w-full rounded-xl border ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-[#E5E0D8] focus:border-[#6A1B1A] focus:ring-[#6A1B1A]'} bg-white pl-11 pr-12 text-[15px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-200 focus:outline-none focus:ring-1 shadow-sm`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2B2B2B]/40 hover:text-[#2B2B2B]/80 p-2 transition-colors focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                </button>
                {errors.password && (
                  <p role="alert" className="text-[13px] text-red-600 font-medium absolute -bottom-5 left-1">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </div>

            {/* Forgot Password */}
            <div className="w-full flex justify-end mt-3 mb-6">
              <button
                type="button"
                onClick={() => { setForgotPasswordMode(true); setFormError(null); }}
                className="text-[13px] font-semibold text-[#6A1B1A] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {formError && (
              <p role="alert" className="text-[13px] text-red-600 font-medium w-full text-center mb-4 bg-red-50 py-2 rounded-lg">
                {formError}
              </p>
            )}

            {/* Sign In Button */}
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full h-[52px] rounded-xl bg-[#6A1B1A] text-white text-[16px] font-semibold transition-all duration-200 hover:bg-[#5a1615] flex items-center justify-center shadow-md disabled:opacity-70"
            >
              {isSubmitting ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                'Sign in'
              )}
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center w-full my-6">
              <div className="w-full border-t border-[#E5E0D8]" />
              <span className="absolute bg-[#FAF6F0] px-3 text-[11px] font-semibold text-[#2B2B2B]/40 uppercase tracking-widest">
                OR
              </span>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full h-[52px] rounded-xl border border-[#E5E0D8] bg-white hover:bg-gray-50 text-[#2B2B2B] font-semibold transition-all duration-200 flex items-center justify-center gap-3 text-[15px] shadow-sm"
            >
              {isGoogleLoading ? (
                <span className="animate-spin h-5 w-5 border-2 border-[#2B2B2B]/30 border-t-[#2B2B2B] rounded-full" />
              ) : (
                <>
                  <svg className="h-[20px] w-[20px] shrink-0" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z" />
                    <path fill="#FBBC05" d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z" />
                    <path fill="#4285F4" d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Create Account Link */}
            <div className="mt-8 text-center text-[14px] text-[#2B2B2B]/80 font-medium">
              New to Mysuru Paakashale?{' '}
              <Link to="/signup" className="font-semibold text-[#6A1B1A] hover:underline">
                Create your account &rarr;
              </Link>
            </div>
          </form>
        )}

        {/* Footer section (Trust Badges + Terms) */}
        <div className="w-full mt-12 flex flex-col items-center">
          
          <div className="w-full border-t border-b border-[#E5E0D8]/60 py-5 flex items-center justify-between px-2 gap-2">
            
            <div className="flex flex-col items-center sm:flex-row sm:items-start gap-2 flex-1 justify-center text-center sm:text-left">
              <ShieldCheck className="w-5 h-5 text-[#6A1B1A] shrink-0" strokeWidth={1.5} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#2B2B2B]">Secure Login</span>
                <span className="text-[9px] text-[#2B2B2B]/60 leading-tight">Your data is protected</span>
              </div>
            </div>

            <div className="flex flex-col items-center sm:flex-row sm:items-start gap-2 flex-1 justify-center text-center sm:text-left border-l border-r border-[#E5E0D8]/60 px-2">
              <Mail className="w-5 h-5 text-[#6A1B1A] shrink-0" strokeWidth={1.5} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#2B2B2B]">Email Verified</span>
                <span className="text-[9px] text-[#2B2B2B]/60 leading-tight">For your security</span>
              </div>
            </div>

            <div className="flex flex-col items-center sm:flex-row sm:items-start gap-2 flex-1 justify-center text-center sm:text-left">
              <Utensils className="w-5 h-5 text-[#6A1B1A] shrink-0" strokeWidth={1.5} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#2B2B2B]">Fresh & Homemade</span>
                <span className="text-[9px] text-[#2B2B2B]/60 leading-tight">Delivered with care</span>
              </div>
            </div>

          </div>

          <p className="text-[11px] text-[#2B2B2B]/60 text-center mt-6">
            By continuing, you agree to our <a href="#" className="font-semibold text-[#6A1B1A] hover:underline">Terms of Service</a> and <a href="#" className="font-semibold text-[#6A1B1A] hover:underline">Privacy Policy</a>.
          </p>
        </div>

      </div>
    </div>
  );
}
