import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import { signIn, signInWithGoogle, mapAuthError, resetPassword } from '../services/authService';
import { DesktopAuthLayout } from '../components/DesktopAuthLayout';
import type { LoginFormValues } from '../types/auth.types';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function DesktopLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema)
  });

  const goToNext = () => {
    const from = (location.state as { from?: Location } | null)?.from;
    navigate(from?.pathname ?? '/', { replace: true });
  };

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      goToNext();
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
      goToNext();
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
    <DesktopAuthLayout>
      {/* FROSTED GLASS CARD */}
      <div className="w-full bg-white/50 p-6 md:p-8 rounded-[32px] backdrop-blur-md border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] animate-in fade-in duration-500">

        {forgotPasswordMode ? (
          <form onSubmit={handleResetPassword} noValidate className="w-full flex flex-col gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-[#2c150c] tracking-tight">
                Reset password
              </h1>
              <p className="mt-2 text-sm text-[#6e584f] font-medium">
                Enter your email and we'll send a reset link.
              </p>
            </div>

            <div className="flex flex-col gap-1 mt-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] pointer-events-none">
                  <Mail size={20} strokeWidth={1.8} />
                </div>
                <input
                  type="email"
                  aria-label="Email address for password reset"
                  placeholder="Email address"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value.toLowerCase())}
                  className="lowercase h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] placeholder:text-[#a08d85] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="text-sm font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center border border-red-100">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full h-12 rounded-xl bg-[#5c1417] hover:bg-[#470f12] text-white font-semibold text-base shadow-md transition-all mt-4 flex justify-center items-center"
            >
              {resetLoading ? <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotPasswordMode(false); setFormError(null); }}
              className="mt-4 w-full text-center text-sm font-semibold text-[#5c1417] hover:underline"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="w-full flex flex-col gap-4">
            <div>
              <h1 className="font-display text-[28px] md:text-[32px] font-bold text-[#2c150c] tracking-tight leading-none flex items-center gap-2">
                Welcome back <span className="text-3xl" aria-hidden="true">👋</span>
              </h1>
              <p className="mt-2 text-[15px] text-[#6e584f] font-medium">
                Sign in to manage today's tiffin.
              </p>
            </div>

            <div className="flex flex-col gap-3 mt-1">
              <div className="flex flex-col gap-1">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] pointer-events-none">
                    <Mail size={20} strokeWidth={1.8} />
                  </div>
                  <input
                    type="email"
                    aria-label="Email address"
                    placeholder="Email address"
                    autoComplete="email"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="lowercase h-11 md:h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] placeholder:text-[#a08d85] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]"
                    {...register('email')}
                  />
                </div>
                {errors.email && <p className="text-sm text-red-600 ml-2">{errors.email.message}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] pointer-events-none">
                    <Lock size={20} strokeWidth={1.8} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    aria-label="Password"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    className="h-11 md:h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-12 text-[15px] text-[#2c150c] placeholder:text-[#a08d85] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4a44] p-1"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-red-600 ml-2">{errors.password.message}</p>}
              </div>
            </div>

            <div className="w-full flex justify-end -mt-3">
              <button
                type="button"
                onClick={() => { setForgotPasswordMode(true); setFormError(null); }}
                className="text-sm font-semibold text-[#5c1417] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {formError && (
              <p role="alert" className="text-sm font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center border border-red-100">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 md:h-12 rounded-xl bg-[#5c1417] hover:bg-[#470f12] text-white font-semibold text-[17px] shadow-md transition-all flex justify-center items-center mt-1"
            >
              {isSubmitting ? <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Sign in'}
            </button>

            <div className="relative flex items-center justify-center w-full my-2">
              <div className="w-full border-t border-[#e8ded2]" />
              <span className="absolute bg-[#f9f1e8] px-4 text-xs font-bold text-[#5a4a44] uppercase tracking-widest rounded-full">
                Or
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full h-11 md:h-12 rounded-xl border border-[#e8ded2] bg-white hover:bg-stone-50 text-[#2c150c] font-semibold text-[15px] flex items-center justify-center gap-3 shadow-sm transition-colors"
            >
              {isGoogleLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#8c746a] border-t-[#2c150c]" />
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z" />
                    <path fill="#FBBC05" d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z" />
                    <path fill="#4285F4" d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <p className="mt-1 text-center text-[15px] text-[#6e584f] font-medium">
              New to Mysuru Paakashale?{' '}
              <Link to="/signup" className="font-bold text-[#5c1417] hover:underline">
                Create Account
              </Link>
            </p>
          </form>
        )}

        <p className="mt-4 text-[11px] text-[#5a4a44] text-center px-4 leading-tight">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="font-semibold text-[#5c1417] hover:underline">Terms of Service</Link> and{' '}
          <Link to="/privacy" className="font-semibold text-[#5c1417] hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </DesktopAuthLayout>
  );
}
