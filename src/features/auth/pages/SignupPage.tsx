import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [registrationStep, setRegistrationStep] = useState<1 | 2 | 3>(1);

  // Show/Hide password states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Google Signup Flow Step States
  const [signupStep, setSignupStep] = useState<0 | 1 | 2>(0);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any | null>(null);
  
  // Custom states for Google signup form
  const [googlePhone, setGooglePhone] = useState('');
  const [googlePassword, setGooglePassword] = useState('');
  const [googleConfirmPassword, setGoogleConfirmPassword] = useState('');
  const [googleErrors, setGoogleErrors] = useState<{ phone?: string; password?: string; confirmPassword?: string }>({});
  
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    trigger,
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

  const handleRegistrationNext = async () => {
    setFormError(null);

    const isCurrentStepValid = registrationStep === 1
      ? await trigger(['fullName', 'email'])
      : registrationStep === 2
        ? await trigger('phone')
        : true;

    if (isCurrentStepValid && registrationStep < 3) {
      setRegistrationStep((current) => (current + 1) as 1 | 2 | 3);
    }
  };

  const handleRegistrationBack = () => {
    setFormError(null);
    setRegistrationStep((current) => (current - 1) as 1 | 2 | 3);
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
        setSignupStep(1); // Proceed to Complete Profile step
      }
    } catch (err) {
      setFormError(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePhoneStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleErrors({});
    if (!INDIAN_MOBILE_REGEX.test(googlePhone)) {
      setGoogleErrors({ phone: 'Enter a valid 10-digit mobile number' });
      return;
    }
    setSignupStep(2); // Proceed to Create Password step
  };

  const handleCompleteGoogleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleErrors({});
    setFormError(null);
    
    let hasError = false;
    const newErrors: typeof googleErrors = {};

    if (googlePassword.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      hasError = true;
    } else if (!/[A-Z]/.test(googlePassword)) {
      newErrors.password = 'Password must contain at least one uppercase letter';
      hasError = true;
    } else if (!/[a-z]/.test(googlePassword)) {
      newErrors.password = 'Password must contain at least one lowercase letter';
      hasError = true;
    } else if (!/[0-9]/.test(googlePassword)) {
      newErrors.password = 'Password must contain at least one number';
      hasError = true;
    } else if (!/[^A-Za-z0-9]/.test(googlePassword)) {
      newErrors.password = 'Password must contain at least one special character';
      hasError = true;
    }

    if (googlePassword !== googleConfirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      hasError = true;
    }

    if (hasError) {
      setGoogleErrors(newErrors);
      return;
    }

    setGoogleLoading(true);
    try {
      await signUpWithGoogle(pendingGoogleUser, googlePhone, googlePassword);
      toast.success('Account created successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      const errMsg = (err as Error).message || 'Failed to complete signup';
      if (errMsg.includes('mobile number')) {
        setGoogleErrors({ phone: errMsg });
        setSignupStep(1); 
      } else {
        setFormError(errMsg);
      }
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
    setGooglePassword('');
    setGoogleConfirmPassword('');
    setGoogleErrors({});
    setFormError(null);
    setSignupStep(0);
  };

  return (
    <AuthLayout>
      {signupStep === 1 && pendingGoogleUser && (
        <form onSubmit={handlePhoneStepSubmit} className="mp-auth-form mp-auth-signup-step flex flex-col gap-5 w-full relative z-10">
          <div className="mb-2">
            <h2 className="font-display text-[28px] font-bold text-[#5B1612] mb-1 leading-tight">
              Complete Profile
            </h2>
            <p className="text-[15px] text-ink-700 font-medium pr-8">
              Step 1 of 2: Enter your mobile number.
            </p>
          </div>

          <p className="text-sm text-ink-700 leading-relaxed font-medium bg-white/50 p-3 rounded-xl border border-rice-300">
            Hi <strong>{pendingGoogleUser.displayName || 'there'}</strong>! Please provide your phone number so our team can coordinate daily meal deliveries.
          </p>
          
          <div className="flex flex-col gap-1">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
                <Phone size={20} strokeWidth={1.5} />
              </div>
              <input
                type="tel"
                placeholder="Mobile number"
                required
                value={googlePhone}
                onChange={(e) => setGooglePhone(e.target.value)}
                className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-4 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] shadow-sm ${
                  googleErrors.phone ? 'border-danger focus:ring-danger' : ''
                }`}
              />
            </div>
            {googleErrors.phone && (
              <p role="alert" className="text-sm text-danger ml-2">
                {googleErrors.phone}
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 rounded-xl bg-[#5B1612] hover:bg-[#721c16] text-white text-[17px] font-semibold transition-colors mt-2 shadow-sm"
          >
            Next: Create Password
          </Button>

          <Button 
            type="button" 
            onClick={handleCancelGoogleSignup}
            variant="ghost"
            className="w-full h-12 rounded-xl text-ink-600 hover:text-ink-900 transition-colors text-[15px] font-medium"
          >
            Cancel
          </Button>
        </form>
      )}

      {signupStep === 2 && pendingGoogleUser && (
        <form onSubmit={handleCompleteGoogleSignup} className="mp-auth-form mp-auth-signup-step flex flex-col gap-5 w-full relative z-10">
          <div className="mb-2">
            <h2 className="font-display text-[28px] font-bold text-[#5B1612] mb-1 leading-tight">
              Create Password
            </h2>
            <p className="text-[15px] text-ink-700 font-medium pr-8">
              Step 2 of 2: Secure your account credentials.
            </p>
          </div>

          <div className="mp-auth-fields flex flex-col gap-4">
            {/* Password */}
            <div className="flex flex-col gap-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
                  <Lock size={20} strokeWidth={1.5} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create Password"
                  required
                  value={googlePassword}
                  onChange={(e) => setGooglePassword(e.target.value)}
                  className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-12 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] shadow-sm ${
                    googleErrors.password ? 'border-danger focus:ring-danger' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1"
                >
                  {showPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                </button>
              </div>
              {googleErrors.password && (
                <p role="alert" className="text-sm text-danger ml-2">
                  {googleErrors.password}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
                  <Lock size={20} strokeWidth={1.5} />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  required
                  value={googleConfirmPassword}
                  onChange={(e) => setGoogleConfirmPassword(e.target.value)}
                  className={`h-14 w-full rounded-xl border border-rice-300 bg-white pl-12 pr-12 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-1 focus:border-[#5B1612] focus:ring-[#5B1612] shadow-sm ${
                    googleErrors.confirmPassword ? 'border-danger focus:ring-danger' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1"
                >
                  {showConfirmPassword ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}
                </button>
              </div>
              {googleErrors.confirmPassword && (
                <p role="alert" className="text-sm text-danger ml-2">
                  {googleErrors.confirmPassword}
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
            isLoading={googleLoading}
            className="w-full h-14 rounded-xl bg-[#5B1612] hover:bg-[#721c16] text-white text-[17px] font-semibold transition-colors mt-2 shadow-sm"
          >
            Complete Registration
          </Button>

          <div className="flex gap-2">
            <Button 
              type="button" 
              onClick={() => setSignupStep(1)}
              variant="ghost"
              className="w-1/2 h-12 rounded-xl text-ink-600 hover:text-ink-900 transition-colors text-[15px] font-medium"
            >
              Back
            </Button>
            <Button 
              type="button" 
              onClick={handleCancelGoogleSignup}
              variant="ghost"
              className="w-1/2 h-12 rounded-xl text-danger hover:text-[#962325] transition-colors text-[15px] font-medium"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {signupStep === 0 && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mp-auth-form mp-registration-form">
          <div className="mp-registration-header">
            <div className="mp-registration-progress" aria-label={`Step ${registrationStep} of 3`}>
              {[1, 2, 3].map((step) => (
                <span key={step} className={step <= registrationStep ? 'is-active' : ''} />
              ))}
            </div>
            <p className="mp-registration-step-label">Step {registrationStep} of 3</p>
            <h2>
              {registrationStep === 1 && 'Create your account'}
              {registrationStep === 2 && 'Your delivery contact'}
              {registrationStep === 3 && 'Secure your account'}
            </h2>
            <p>
              {registrationStep === 1 && 'Let’s start with the essentials.'}
              {registrationStep === 2 && 'Where can we coordinate your meal deliveries?'}
              {registrationStep === 3 && 'Choose a strong password to keep your account safe.'}
            </p>
          </div>

          {registrationStep === 1 && (
            <div className="mp-registration-fields">
              <div className="mp-registration-field">
                <label htmlFor="signup-full-name">Full name</label>
                <div className="relative">
                  <User aria-hidden="true" />
                  <input
                    id="signup-full-name"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    className={errors.fullName ? 'has-error' : ''}
                    {...register('fullName')}
                  />
                </div>
                {errors.fullName && <p role="alert">{errors.fullName.message}</p>}
              </div>

              <div className="mp-registration-field">
                <label htmlFor="signup-email">Email address</label>
                <div className="relative">
                  <Mail aria-hidden="true" />
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    className={errors.email ? 'has-error' : ''}
                    {...register('email')}
                  />
                </div>
                {errors.email && <p role="alert">{errors.email.message}</p>}
              </div>
            </div>
          )}

          {registrationStep === 2 && (
            <div className="mp-registration-fields">
              <div className="mp-registration-field">
                <label htmlFor="signup-phone">Mobile number</label>
                <div className="relative">
                  <Phone aria-hidden="true" />
                  <input
                    id="signup-phone"
                    type="tel"
                    placeholder="10-digit mobile number"
                    autoComplete="tel"
                    className={errors.phone ? 'has-error' : ''}
                    {...register('phone')}
                  />
                </div>
                <small>Used only for delivery coordination.</small>
                {errors.phone && <p role="alert">{errors.phone.message}</p>}
              </div>
            </div>
          )}

          {registrationStep === 3 && (
            <>
              <div className="mp-registration-fields">
                <div className="mp-registration-field">
                  <label htmlFor="signup-password">Password</label>
                  <div className="relative">
                    <Lock aria-hidden="true" />
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a password"
                      autoComplete="new-password"
                      className={errors.password ? 'has-error' : ''}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.password && <p role="alert">{errors.password.message}</p>}
                </div>

                <div className="mp-registration-field">
                  <label htmlFor="signup-confirm-password">Confirm password</label>
                  <div className="relative">
                    <Lock aria-hidden="true" />
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      className={errors.confirmPassword ? 'has-error' : ''}
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p role="alert">{errors.confirmPassword.message}</p>}
                </div>
              </div>

              <label className="mp-registration-consent">
                <input type="checkbox" {...register('agreed')} />
                <span>
                  I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.
                </span>
              </label>
              {errors.agreed && <p role="alert" className="mp-registration-error">{errors.agreed.message}</p>}
            </>
          )}

          {formError && <p role="alert" className="mp-registration-error">{formError}</p>}

          <div className="mp-registration-actions">
            {registrationStep > 1 && (
              <Button type="button" variant="ghost" onClick={handleRegistrationBack} className="mp-registration-back">
                Back
              </Button>
            )}
            {registrationStep < 3 ? (
              <Button type="button" onClick={handleRegistrationNext} className="mp-auth-submit mp-registration-next">
                Continue
              </Button>
            ) : (
              <Button type="submit" isLoading={isSubmitting} className="mp-auth-submit mp-registration-next">
                Create Account
              </Button>
            )}
          </div>

          {registrationStep === 1 && (
            <>
              <div className="mp-auth-separator">
                <div />
                <span>OR</span>
              </div>
              <button type="button" onClick={handleGoogleSignUpClick} disabled={googleLoading} className="mp-auth-google">
                {googleLoading ? (
                  <span className="animate-spin h-5 w-5 border-2 border-ink-400 border-t-transparent rounded-full" />
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
            </>
          )}
        </form>
      )}

      {signupStep === 0 && (
        <div className="mp-auth-account mt-2 text-center text-[15px] font-medium text-ink-700">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-[#5B1612] hover:underline">
            Sign In
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
