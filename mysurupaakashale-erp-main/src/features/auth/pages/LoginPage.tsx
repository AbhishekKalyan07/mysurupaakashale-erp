import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Eye, EyeOff, Mail, ShieldCheck, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { signIn, signInWithGoogle, mapAuthError, resetPassword } from '../services/authService';
import type { LoginFormValues } from '../types/auth.types';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * The signature element for the auth experience: a stacked steel tiffin
 * carrier (the literal object this business delivers every day), rendered
 * flat in brand tokens rather than a stock photo. The steam wisp reuses
 * the app's one signature motion (--animate-leaf-sway, same as
 * LeafSpinner) instead of inventing a second animation language, and — like
 * every animation in this app — is automatically stilled by the global
 * prefers-reduced-motion rule in index.css.
 */
function TiffinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} aria-hidden="true">
      <g className="animate-leaf-sway" style={{ transformOrigin: '100px 80px' }}>
        <path
          d="M92 78c-6-10-6-22 2-30M108 78c6-10 6-22-2-30"
          stroke="var(--color-rice-100)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
      </g>
      <rect x="78" y="70" width="44" height="14" rx="5" fill="var(--color-turmeric-400)" />
      <rect x="94" y="58" width="12" height="18" rx="3" fill="var(--color-turmeric-500)" />
      <rect x="52" y="84" width="96" height="38" rx="10" fill="var(--color-leaf-500)" />
      <rect x="52" y="118" width="96" height="38" rx="10" fill="var(--color-leaf-600)" />
      <rect x="52" y="152" width="96" height="38" rx="10" fill="var(--color-leaf-700)" />
      <rect x="94" y="82" width="12" height="110" fill="var(--color-tamarind-500)" opacity="0.85" />
      <circle cx="100" cy="103" r="4" fill="var(--color-rice-50)" opacity="0.9" />
      <circle cx="100" cy="137" r="4" fill="var(--color-rice-50)" opacity="0.9" />
      <circle cx="100" cy="171" r="4" fill="var(--color-rice-50)" opacity="0.9" />
    </svg>
  );
}

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'Secure sign-in', body: 'Your data is protected' },
  { icon: Mail, title: 'Verified accounts', body: 'Every login is confirmed' },
  { icon: Utensils, title: 'Fresh & homemade', body: 'Delivered with care' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

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
    <div className="min-h-dvh w-full flex bg-rice-50 font-sans selection:bg-turmeric-200 selection:text-leaf-900">
      {/* ---------- Brand panel — desktop/tablet only ---------- */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[38%] relative flex-col justify-between bg-leaf-900 px-12 py-14 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(var(--color-turmeric-200) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-turmeric-400" />
          <span className="font-display text-lg font-semibold tracking-wide text-rice-50">
            Mysuru Paakashale
          </span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center gap-8 my-auto">
          <TiffinMark className="w-40 h-44" />
          <div className="max-w-[300px]">
            <h1 className="font-display text-[28px] leading-tight font-semibold text-rice-50">
              Real taste of nammuru
            </h1>
            <p className="mt-3 text-sm text-rice-200/80 font-medium leading-relaxed">
              Sign in to track today&rsquo;s tiffin, manage your subscription, and skip a day
              whenever you need to.
            </p>
          </div>
        </div>

        <div className="relative z-10 text-xs text-rice-200/60 font-medium">
          &copy; {new Date().getFullYear()} Mysuru Paakashale. Home-style meals, every day.
        </div>
      </div>

      {/* ---------- Form panel ---------- */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-[400px] animate-in fade-in duration-500">
          {/* Compact brand mark — mobile only, since the panel above is hidden */}
          <div className="mb-8 flex lg:hidden flex-col items-center gap-3">
            {!logoFailed ? (
              <img
                src="/logo.png"
                alt="Mysuru Paakashale"
                className="h-14 w-auto object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <TiffinMark className="w-14 h-16" />
            )}
            <div className="flex items-center gap-2">
              <div className="h-px w-6 bg-rice-300" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-leaf-700">
                Real taste of nammuru
              </p>
              <div className="h-px w-6 bg-rice-300" />
            </div>
          </div>

          {forgotPasswordMode ? (
            <form onSubmit={handleResetPassword} noValidate className="w-full">
              <h1 className="font-display text-[26px] font-semibold text-ink-900 tracking-tight">
                Reset your password
              </h1>
              <p className="mt-2 text-sm text-ink-500 font-medium">
                Enter your email address and we&rsquo;ll send you a secure reset link.
              </p>

              <div className="mt-7">
                <Input
                  type="email"
                  label="Email address"
                  placeholder="you@example.com"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>

              {formError && (
                <p role="alert" className="mt-4 text-sm font-medium text-danger bg-danger-subtle rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <Button type="submit" isLoading={resetLoading} size="lg" className="w-full mt-6 font-semibold">
                Send reset link
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordMode(false);
                  setFormError(null);
                }}
                className="mt-6 w-full text-center text-sm font-semibold text-leaf-700 hover:text-leaf-800 hover:underline"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="w-full">
              <h1 className="font-display text-[30px] font-semibold text-ink-900 tracking-tight">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-ink-500 font-medium">
                Sign in to manage today&rsquo;s tiffin.
              </p>

              <div className="mt-7 flex flex-col gap-4">
                <Input
                  type="email"
                  label="Email address"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  error={errors.email?.message}
                  {...register('email')}
                />

                <div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="pr-11"
                      error={errors.password?.message}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-[48px] -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full flex justify-end mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordMode(true);
                    setFormError(null);
                  }}
                  className="text-sm font-semibold text-leaf-700 hover:text-leaf-800 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {formError && (
                <p role="alert" className="mt-4 text-sm font-medium text-danger bg-danger-subtle rounded-lg px-3 py-2 text-center">
                  {formError}
                </p>
              )}

              <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full mt-6 font-semibold">
                Sign in
              </Button>

              <div className="relative flex items-center justify-center w-full my-6">
                <div className="w-full border-t border-rice-300" />
                <span className="absolute bg-rice-50 px-3 text-[11px] font-semibold text-ink-400 uppercase tracking-widest">
                  Or
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="w-full h-12 rounded-lg border border-rice-300 bg-rice-25 hover:bg-rice-100 text-ink-900 font-semibold text-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-700" />
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

              <p className="mt-8 text-center text-sm text-ink-500 font-medium">
                New to Mysuru Paakashale?{' '}
                <Link to="/signup" className="font-semibold text-leaf-700 hover:text-leaf-800 hover:underline">
                  Create your account &rarr;
                </Link>
              </p>
            </form>
          )}

          {/* ---------- Trust strip ---------- */}
          <div className="mt-12 pt-5 border-t border-rice-200 grid grid-cols-3 gap-2">
            {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col items-center text-center gap-1">
                <Icon className="w-4 h-4 text-leaf-700" strokeWidth={1.75} />
                <span className="text-[10px] font-bold text-ink-900 leading-tight">{title}</span>
                <span className="text-[9px] text-ink-500 leading-tight">{body}</span>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[11px] text-ink-500 text-center">
            By continuing, you agree to our{' '}
            <a href="#" className="font-semibold text-leaf-700 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="font-semibold text-leaf-700 hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
