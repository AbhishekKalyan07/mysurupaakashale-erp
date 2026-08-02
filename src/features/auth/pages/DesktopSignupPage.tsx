import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

import { signUpCustomer, mapAuthError, authenticateWithGoogleForSignup, signUpWithGoogle, cancelGoogleSignup } from '../services/authService';
import { DesktopAuthLayout } from '../components/DesktopAuthLayout';
import type { SignupFormValues } from '../types/auth.types';

const INDIAN_MOBILE_REGEX = /^(?:\+91[-\s]?)?[6-9]\d{9}$/;

interface ExtendedSignupFormValues extends SignupFormValues { agreed: boolean; }

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter a valid name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  agreed: z.boolean().refine(val => val === true, 'You must agree to continue'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
});

export function DesktopSignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [signupStep, setSignupStep] = useState<0 | 1 | 2>(0);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any | null>(null);
  const [googlePhone, setGooglePhone] = useState('');
  const [googlePassword, setGooglePassword] = useState('');
  const [googleConfirmPassword, setGoogleConfirmPassword] = useState('');
  const [googleErrors, setGoogleErrors] = useState<{ phone?: string; password?: string; confirmPassword?: string }>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ExtendedSignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '', agreed: false }
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
        setSignupStep(1);
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
    setSignupStep(2);
  };

  const handleCompleteGoogleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleErrors({});
    setFormError(null);
    if (googlePassword.length < 6 || googlePassword !== googleConfirmPassword) {
      setGoogleErrors({ password: 'Valid passwords required to match.' });
      return;
    }
    setGoogleLoading(true);
    try {
      await signUpWithGoogle(pendingGoogleUser, googlePhone, googlePassword);
      toast.success('Account created successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCancelGoogleSignup = async () => {
    if (pendingGoogleUser) await cancelGoogleSignup(pendingGoogleUser);
    setPendingGoogleUser(null);
    setSignupStep(0);
  };

  return (
    <DesktopAuthLayout>
      <div className="w-full bg-white/50 p-6 md:p-8 rounded-[32px] backdrop-blur-md border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] animate-in fade-in duration-500">

        {signupStep === 1 && pendingGoogleUser && (
          <form onSubmit={handlePhoneStepSubmit} className="flex flex-col gap-4 w-full">
            <div>
              <h2 className="font-display text-3xl font-bold text-[#2c150c] tracking-tight">Complete Profile</h2>
              <p className="text-[15px] text-[#6e584f] font-medium mt-1">Step 1 of 2: Mobile number</p>
            </div>
            <p className="text-sm text-[#5c4a42] bg-white/60 p-4 rounded-xl border border-[#e8ded2] leading-relaxed">
              Hi <strong>{pendingGoogleUser.displayName}</strong>! We need your phone number for delivery coordination.
            </p>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
              <input type="tel" placeholder="Mobile number" required value={googlePhone} onChange={(e) => setGooglePhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" />
            </div>
            {googleErrors.phone && <p className="text-sm text-red-600">{googleErrors.phone}</p>}

            <button type="submit" className="w-full h-11 rounded-xl bg-[#5c1417] text-white font-semibold text-[17px] shadow-md hover:bg-[#470f12] transition-colors">
              Next Step
            </button>
            <button type="button" onClick={handleCancelGoogleSignup} className="w-full h-10 text-[15px] font-semibold text-[#8c746a] hover:text-[#5c1417] transition-colors">
              Cancel
            </button>
          </form>
        )}

        {signupStep === 2 && pendingGoogleUser && (
          <form onSubmit={handleCompleteGoogleSignup} className="flex flex-col gap-4 w-full">
            <div>
              <h2 className="font-display text-3xl font-bold text-[#2c150c] tracking-tight">Create Password</h2>
              <p className="text-[15px] text-[#6e584f] font-medium mt-1">Step 2 of 2: Secure account</p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Create Password" required value={googlePassword} onChange={(e) => setGooglePassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-12 text-[15px] focus:outline-none focus:border-[#5c1417]" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c746a] p-1">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" required value={googleConfirmPassword} onChange={(e) => setGoogleConfirmPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-12 text-[15px] focus:outline-none focus:border-[#5c1417]" />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c746a] p-1">
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            {googleErrors.password && <p className="text-sm text-red-600">{googleErrors.password}</p>}
            {formError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError}</p>}

            <button type="submit" disabled={googleLoading} className="w-full h-11 rounded-xl bg-[#5c1417] text-white font-semibold text-[17px] shadow-md flex justify-center items-center hover:bg-[#470f12] transition-colors">
              {googleLoading ? <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Complete Registration'}
            </button>
          </form>
        )}

        {signupStep === 0 && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3 w-full">
            <div>
              <h1 className="font-display text-3xl font-bold text-[#2c150c] tracking-tight leading-none">
                Create Account
              </h1>
              <p className="text-[15px] text-[#6e584f] font-medium mt-1">
                Join thousands enjoying homemade food
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                  <input type="text" placeholder="Full Name" className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('fullName')} />
                </div>
                {errors.fullName && <p className="text-sm text-red-600 ml-2 mt-1">{errors.fullName.message as string}</p>}
              </div>

              <div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                  <input type="email" autoCapitalize="none" autoCorrect="off" placeholder="Email address" className="lowercase h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('email')} />
                </div>
                {errors.email && <p className="text-sm text-red-600 ml-2 mt-1">{errors.email.message as string}</p>}
              </div>

              <div>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                  <input type="tel" placeholder="Mobile number" className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-4 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('phone')} />
                </div>
                {errors.phone && <p className="text-sm text-red-600 ml-2 mt-1">{errors.phone.message as string}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password" className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-12 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('password')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c746a] p-1">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                </div>
                {errors.password && <p className="text-sm text-red-600 ml-2 mt-1">{errors.password.message as string}</p>}
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c746a] w-5 h-5" />
                  <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" className="h-11 w-full rounded-xl border border-[#e8ded2] bg-white pl-12 pr-12 text-[15px] text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('confirmPassword')} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c746a] p-1">{showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                </div>
                {errors.confirmPassword && <p className="text-sm text-red-600 ml-2 mt-1">{errors.confirmPassword.message as string}</p>}
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer text-[13px] text-[#5c4a42] font-medium">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-[#e8ded2] text-[#5c1417] focus:ring-[#5c1417]" {...register('agreed')} />
              <span className="leading-tight">I agree to the <Link to="/terms" className="font-bold text-[#5c1417] hover:underline">Terms of Service</Link> & <Link to="/privacy" className="font-bold text-[#5c1417] hover:underline">Privacy Policy</Link></span>
            </label>
            {errors.agreed && <p className="text-sm text-red-600 ml-7 -mt-2">{errors.agreed.message as string}</p>}

            {formError && <p className="text-[15px] text-red-600 bg-red-50 p-2 rounded-lg text-center">{formError}</p>}

            <button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl bg-[#5c1417] hover:bg-[#470f12] text-white font-semibold text-[17px] shadow-md transition-colors flex justify-center items-center">
              {isSubmitting ? <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Create Account'}
            </button>

            <div className="relative flex items-center justify-center w-full my-1">
              <div className="w-full border-t border-[#e8ded2]" />
              <span className="absolute bg-[#f9f1e8] px-4 text-xs font-bold text-[#8c746a] uppercase tracking-widest rounded-full">Or</span>
            </div>

            <button type="button" onClick={handleGoogleSignUpClick} disabled={googleLoading} className="w-full h-11 rounded-xl border border-[#e8ded2] bg-white hover:bg-stone-50 text-[#2c150c] font-semibold text-[15px] flex items-center justify-center gap-3 shadow-sm transition-colors">
              {googleLoading ? <span className="animate-spin h-5 w-5 border-2 border-[#8c746a] border-t-[#2c150c] rounded-full" /> : (
                <><svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z" /><path fill="#FBBC05" d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z" /><path fill="#4285F4" d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z" /><path fill="#34A853" d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z" /></svg>Continue with Google</>
              )}
            </button>
          </form>
        )}

        {signupStep === 0 && (
          <p className="mt-3 text-center text-[15px] text-[#6e584f] font-medium">
            Already have an account? <Link to="/login" className="font-bold text-[#5c1417] hover:underline">Sign In</Link>
          </p>
        )}
      </div>
    </DesktopAuthLayout>
  );
}
