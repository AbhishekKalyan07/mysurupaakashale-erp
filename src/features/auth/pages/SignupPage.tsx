import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { 
  signUpCustomer, 
  mapAuthError, 
  authenticateWithGoogleForSignup, 
  signUpWithGoogle, 
  cancelGoogleSignup 
} from '../services/authService';
import { AuthLayout } from '../components/AuthLayout';
import type { SignupFormValues } from '../types/auth.types';
import toast from 'react-hot-toast';

const INDIAN_MOBILE_REGEX = /^(?:\+91[-\s]?)?[6-9]\d{9}$/;

interface ExtendedSignupFormValues extends SignupFormValues {
  agreed: boolean;
}

const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Please enter a valid name'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    phone: z.string().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit mobile number'),
    password: z.string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
    agreed: z.boolean().refine(val => val === true, 'You must agree to the terms and policies'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // Pending Google Signup flow state
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any | null>(null);
  const [googlePhone, setGooglePhone] = useState('');
  const [googlePhoneError, setGooglePhoneError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExtendedSignupFormValues>({ 
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      agreed: false
    }
  });

  const onSubmit = async (values: ExtendedSignupFormValues) => {
    setFormError(null);
    try {
      await signUpCustomer(values.email, values.password, values.fullName, values.phone);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    }
  };

  const handleGoogleSignUpClick = async () => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const { user, exists } = await authenticateWithGoogleForSignup();
      if (exists) {
        toast.success('Account already exists. Logging in...');
        navigate('/', { replace: true });
      } else {
        setPendingGoogleUser(user);
      }
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCompleteGoogleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGooglePhoneError(null);
    if (!INDIAN_MOBILE_REGEX.test(googlePhone)) {
      setGooglePhoneError('Enter a valid 10-digit mobile number');
      return;
    }

    setGoogleLoading(true);
    try {
      await signUpWithGoogle(pendingGoogleUser, googlePhone);
      toast.success('Account created successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      setGooglePhoneError((err as Error).message || 'Failed to complete signup');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCancelGoogleSignup = async () => {
    if (pendingGoogleUser) {
      await cancelGoogleSignup(pendingGoogleUser);
    }
    setPendingGoogleUser(null);
    setGooglePhone('');
    setGooglePhoneError(null);
  };

  return (
    <AuthLayout title={pendingGoogleUser ? "Complete Registration" : "Sign up"}>
      {pendingGoogleUser ? (
        // Pending Google signup: Collect Phone Number
        <form onSubmit={handleCompleteGoogleSignup} className="flex flex-col gap-4">
          <p className="text-sm text-ink-600 mb-2">
            Hi <strong>{pendingGoogleUser.displayName || 'there'}</strong>! Almost there. Please enter your mobile number to complete your registration.
          </p>
          
          <div className="flex flex-col gap-1">
            <input
              type="tel"
              placeholder="Mobile number"
              required
              value={googlePhone}
              onChange={(e) => setGooglePhone(e.target.value)}
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                googlePhoneError ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
            />
            {googlePhoneError && (
              <p role="alert" className="text-xs text-danger ml-1">
                {googlePhoneError}
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            isLoading={googleLoading}
            className="w-full h-12 rounded-lg bg-tamarind-500 hover:bg-tamarind-600 text-white font-medium transition-colors mt-2"
          >
            Complete Signup
          </Button>

          <Button 
            type="button" 
            onClick={handleCancelGoogleSignup}
            variant="ghost"
            className="w-full h-12 rounded-lg text-ink-500 hover:text-ink-700 transition-colors text-sm"
          >
            Cancel
          </Button>
        </form>
      ) : (
        // Standard signup form
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {/* Full Name */}
          <div className="flex flex-col gap-1">
            <input
              type="text"
              placeholder="Full Name"
              autoComplete="name"
              required
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                errors.fullName ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
              {...register('fullName')}
            />
            {errors.fullName && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                errors.email ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
              {...register('email')}
            />
            {errors.email && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Mobile number */}
          <div className="flex flex-col gap-1">
            <input
              type="tel"
              placeholder="Mobile number"
              autoComplete="tel"
              required
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                errors.phone ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
              {...register('phone')}
            />
            {errors.phone && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.phone.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <input
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              required
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                errors.password ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
              {...register('password')}
            />
            {errors.password && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1">
            <input
              type="password"
              placeholder="Confirm Password"
              autoComplete="new-password"
              required
              className={`h-12 w-full rounded-lg border bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 ${
                errors.confirmPassword ? 'border-danger focus:ring-danger' : 'border-rice-300 focus:ring-tamarind-400 focus:border-tamarind-400'
              }`}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Terms Checkbox */}
          <div className="flex flex-col gap-1 mt-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-ink-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-rice-300 text-tamarind-500 focus:ring-tamarind-400"
                {...register('agreed')}
              />
              <span className="leading-tight">
                I agree to Mysuru Paakashale's{' '}
                <a href="#" className="text-tamarind-500 hover:underline">Terms of Service</a>,{' '}
                <a href="#" className="text-tamarind-500 hover:underline">Privacy Policy</a> and{' '}
                <a href="#" className="text-tamarind-500 hover:underline">Content Policies</a>
              </span>
            </label>
            {errors.agreed && (
              <p role="alert" className="text-xs text-danger ml-1">
                {errors.agreed.message}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger text-center">
              {formError}
            </p>
          )}

          <Button 
            type="submit" 
            isLoading={isSubmitting} 
            className="w-full h-12 rounded-lg bg-tamarind-500 hover:bg-tamarind-600 text-white font-medium transition-colors mt-2"
          >
            Create account
          </Button>

          {/* Separator line */}
          <div className="relative flex items-center justify-center my-3">
            <div className="w-full border-t border-rice-200" />
            <span className="absolute bg-white px-3 text-xs text-ink-400 font-sans">or</span>
          </div>

          {/* Google Sign In/Up */}
          <button
            type="button"
            onClick={handleGoogleSignUpClick}
            disabled={googleLoading}
            className="w-full h-12 rounded-lg border border-rice-300 bg-white hover:bg-rice-50/50 text-ink-700 font-medium transition-colors flex items-center justify-center gap-2.5 text-sm"
          >
            {googleLoading ? (
              <span className="animate-spin h-4 w-4 border-2 border-ink-400 border-t-transparent rounded-full" />
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
                Sign in with Google
              </>
            )}
          </button>
        </form>
      )}

      {!pendingGoogleUser && (
        <div className="mt-6 text-center text-sm text-ink-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-tamarind-500 hover:underline">
            Log in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
