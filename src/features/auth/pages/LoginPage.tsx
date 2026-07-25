import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
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
    <div className="min-h-screen w-full bg-[#F8F5F0] flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-[#7A2E1F]/10 selection:text-[#7A2E1F]">
      <div 
        className="w-full max-w-[1280px] h-[90vh] min-h-[700px] flex bg-white rounded-[28px] relative transition-opacity duration-700 ease-out animate-in fade-in"
        style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.08)' }}
      >
        
        {/* LEFT SIDE: AUTHENTICATION (45%) */}
        <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-20 relative z-10 animate-in slide-in-from-bottom-4 duration-700 fade-in">
          
          <div className="flex flex-col max-w-[420px] mx-auto w-full">
            {/* Logo */}
            <div className="mb-12">
              <img 
                src="/logo.png" 
                alt="Mysuru Paakashale" 
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  // Fallback if logo.png doesn't exist yet
                  const target = e.target as HTMLImageElement;
                  if (target.src.includes('logo.png')) {
                    target.src = '/favicon.svg';
                  }
                }}
              />
            </div>

            {forgotPasswordMode ? (
              <form onSubmit={handleResetPassword} className="flex flex-col gap-6 w-full">
                <div className="mb-2">
                  <h2 className="text-[36px] font-bold text-[#2B2B2B] mb-3 leading-tight tracking-tight">
                    Reset Password
                  </h2>
                  <p className="text-[18px] text-[#2B2B2B]/70 font-normal leading-relaxed">
                    Enter your email to request a secure password reset link.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-medium text-[#2B2B2B] ml-1">Email</label>
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="h-[60px] w-full rounded-[16px] border border-[#ECE8E2] bg-white px-5 text-[16px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-250 ease-out focus:outline-none focus:border-[#7A2E1F] focus:ring-1 focus:ring-[#7A2E1F] hover:border-[#2B2B2B]/20 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
                  />
                </div>

                {formError && (
                  <p role="alert" className="text-[14px] text-red-500 font-medium ml-1">
                    {formError}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={resetLoading}
                  className="w-full h-[60px] rounded-[16px] bg-[#7A2E1F] text-white text-[18px] font-semibold transition-all duration-250 ease-out mt-2 hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(122,46,31,0.25)] disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center"
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
                  className="w-full h-[60px] rounded-[16px] text-[#2B2B2B]/70 hover:text-[#2B2B2B] transition-colors text-[16px] font-medium"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col w-full">
                <div className="mb-10">
                  <h2 className="text-[48px] font-bold text-[#2B2B2B] mb-3 leading-tight tracking-tight flex items-center gap-3">
                    Welcome Back 👋
                  </h2>
                  <p className="text-[18px] text-[#2B2B2B]/70 font-normal leading-relaxed">
                    Sign in to continue your homemade meal subscription.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Email Input */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-medium text-[#2B2B2B] ml-1">Email</label>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      required
                      className={`h-[60px] w-full rounded-[16px] border ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-[#ECE8E2] focus:border-[#7A2E1F] focus:ring-[#7A2E1F] hover:border-[#2B2B2B]/20'} bg-white px-5 text-[16px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-250 ease-out focus:outline-none focus:ring-1 shadow-[0_2px_10px_rgba(0,0,0,0.02)]`}
                      {...register('email')}
                    />
                    {errors.email && (
                      <p role="alert" className="text-[14px] text-red-500 font-medium ml-1">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Password Input */}
                  <div className="flex flex-col gap-2 relative">
                    <div className="flex justify-between items-center ml-1 mb-1">
                      <label className="text-[14px] font-medium text-[#2B2B2B]">Password</label>
                      <button
                        type="button"
                        onClick={() => { setForgotPasswordMode(true); setFormError(null); }}
                        className="text-[14px] font-medium text-[#2B2B2B]/60 hover:text-[#7A2E1F] transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className={`h-[60px] w-full rounded-[16px] border ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-[#ECE8E2] focus:border-[#7A2E1F] focus:ring-[#7A2E1F] hover:border-[#2B2B2B]/20'} bg-white pl-5 pr-14 text-[16px] text-[#2B2B2B] placeholder:text-[#2B2B2B]/40 transition-all duration-250 ease-out focus:outline-none focus:ring-1 shadow-[0_2px_10px_rgba(0,0,0,0.02)]`}
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#2B2B2B]/40 hover:text-[#2B2B2B] p-2 transition-colors focus:outline-none"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p role="alert" className="text-[14px] text-red-500 font-medium ml-1 mt-1">
                        {errors.password.message}
                      </p>
                    )}
                  </div>
                </div>

                {formError && (
                  <p role="alert" className="text-[14px] text-red-500 font-medium ml-1 mt-4">
                    {formError}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={isSubmitting} 
                  className="w-full h-[60px] rounded-[16px] bg-[#7A2E1F] text-white text-[18px] font-semibold transition-all duration-250 ease-out mt-8 hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(122,46,31,0.25)] disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                  ) : (
                    'Sign In'
                  )}
                </button>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-8">
                  <div className="w-full border-t border-[#ECE8E2]" />
                  <span className="absolute bg-white px-4 text-[12px] font-semibold text-[#2B2B2B]/40 tracking-wider">
                    OR
                  </span>
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full h-[60px] rounded-[16px] border border-[#ECE8E2] bg-white hover:bg-[#F8F5F0]/50 text-[#2B2B2B] font-semibold transition-all duration-250 ease-out flex items-center justify-center gap-3 text-[16px] hover:border-[#2B2B2B]/20 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
                >
                  {isGoogleLoading ? (
                    <span className="animate-spin h-5 w-5 border-2 border-[#2B2B2B]/30 border-t-[#2B2B2B] rounded-full" />
                  ) : (
                    <>
                      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z" />
                        <path fill="#FBBC05" d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z" />
                        <path fill="#4285F4" d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z" />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                <div className="mt-8 text-center text-[15px] text-[#2B2B2B]">
                  Don't have an account?{' '}
                  <Link to="/signup" className="font-semibold text-[#7A2E1F] hover:text-[#5B1612] transition-colors">
                    Create Account
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: BRAND HERO (55%) */}
        <div className="hidden lg:block lg:w-[55%] relative h-full bg-[#F8F5F0] overflow-hidden rounded-r-[28px] animate-in fade-in duration-1000">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#7A2E1F]/15 via-transparent to-transparent z-10 pointer-events-none mix-blend-multiply" />
          <img 
            src="/auth_bg.jpg" 
            alt="Mysuru Paakashale Premium Tiffin" 
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback if auth_bg.jpg doesn't exist
              const target = e.target as HTMLImageElement;
              target.src = 'https://images.unsplash.com/photo-1589301773112-09756b19d45e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80';
            }}
          />
        </div>

      </div>
    </div>
  );
}
