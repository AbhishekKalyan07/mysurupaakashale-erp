import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/shared/components/ui/Button';
import { signIn, signInWithGoogle, mapAuthError, resetPassword } from '../services/authService';
import { AuthLayout } from '../components/AuthLayout';
import type { LoginFormValues } from '../types/auth.types';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  
  // Show/Hide password state
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot Password Mode
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

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

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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
    <AuthLayout>
      {forgotPasswordMode ? (
        // Reset password form
        <form onSubmit={handleResetPassword} className="flex flex-col gap-5 w-full relative z-10">
          <div className="mb-4">
            <h2 className="font-display text-[28px] font-bold text-[#5B1612] mb-2 leading-tight">
              Reset Password
            </h2>
            <p className="text-sm text-ink-600 font-medium">
              Enter your email to request a secure password reset link.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400">
                <Mail size={20} strokeWidth={1.5} />
              </div>
              <input
                type="email"
                placeholder="Email address"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-4 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] ${
                  formError ? 'border-danger focus:ring-danger' : ''
                }`}
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger mt-1">
              {formError}
            </p>
          )}

          <Button 
            type="submit" 
            isLoading={resetLoading}
            className="w-full h-14 rounded-xl bg-[#5B1612] hover:bg-[#721c16] text-white text-[17px] font-semibold transition-colors mt-2"
          >
            Send Reset Link
          </Button>

          <Button 
            type="button" 
            onClick={() => { setForgotPasswordMode(false); setFormError(null); }}
            variant="ghost"
            className="w-full h-12 rounded-xl text-ink-600 hover:text-ink-900 transition-colors text-[15px] font-medium"
          >
            Back to Login
          </Button>
        </form>
      ) : (
        // Standard login form
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5 w-full relative z-10">
          <div className="mb-4 pr-12">
            <h2 className="font-display text-[32px] font-bold text-[#5B1612] mb-2 leading-tight flex items-center gap-2">
              Welcome Back <span className="text-2xl">👋</span>
            </h2>
            <p className="text-[15px] text-ink-700 font-medium pr-10">
              Sign in to continue your meal journey
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Email Input */}
            <div className="flex flex-col gap-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
                  <Mail size={20} strokeWidth={1.5} />
                </div>
                <input
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-4 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] shadow-sm ${
                    errors.email ? 'border-danger focus:ring-danger' : ''
                  }`}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p role="alert" className="text-sm text-danger ml-2">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
                  <Lock size={20} strokeWidth={1.5} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-12 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] shadow-sm ${
                    errors.password ? 'border-danger focus:ring-danger' : ''
                  }`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                </button>
              </div>
              
              {/* Forgot Password link directly beneath */}
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => { setForgotPasswordMode(true); setFormError(null); }}
                  className="text-[14px] font-semibold text-ink-700 hover:text-[#5B1612]"
                >
                  Forgot Password?
                </button>
              </div>
              
              {errors.password && (
                <p role="alert" className="text-sm text-danger ml-2">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger font-medium mt-1">
              {formError}
            </p>
          )}

          <Button 
            type="submit" 
            isLoading={isSubmitting} 
            className="w-full h-14 rounded-xl bg-[#5B1612] hover:bg-[#721c16] text-white text-[17px] font-semibold transition-colors mt-2 shadow-sm"
          >
            Sign In
          </Button>

          {/* Separator line */}
          <div className="relative flex items-center justify-center my-2">
            <div className="w-full border-t border-ink-200" />
            <span className="absolute bg-[#FDF8F0] px-4 text-[13px] font-bold text-ink-600 font-sans uppercase">
              OR
            </span>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full h-14 rounded-xl border border-rice-300 bg-white hover:bg-rice-50 text-ink-900 font-bold transition-colors flex items-center justify-center gap-3 text-[16px] shadow-sm"
          >
            {isGoogleLoading ? (
              <span className="animate-spin h-5 w-5 border-2 border-ink-400 border-t-transparent rounded-full" />
            ) : (
              <>
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div className="mt-2 text-center text-[15px] font-medium text-ink-700">
            Don't have an account?{' '}
            <Link to="/signup" className="font-bold text-[#5B1612] hover:underline">
              Create Account
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
