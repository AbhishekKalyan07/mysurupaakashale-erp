import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

import { signUpCustomer, mapAuthError, signInWithGoogle } from '../services/authService';
import { MobileAuthLayout } from '../components/MobileAuthLayout';
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

export function MobileSignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      await signInWithGoogle();
      toast.success('Logged in successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      const errorCode = (err as any)?.code;
      if (errorCode === 'auth/popup-blocked') {
        setFormError('Popup was blocked. Please allow pop-ups for this site and try again.');
      } else if (errorCode === 'auth/popup-closed-by-user' || errorCode === 'auth/cancelled-popup-request') {
        setFormError('Sign-in cancelled.');
      } else {
        setFormError(mapAuthError(err));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <MobileAuthLayout>
      {/* NEW FROSTED GLASS CARD WRAPPER */}
      <div className="w-full bg-white/40 p-5 rounded-[24px] backdrop-blur-sm border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in duration-500">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3 w-full">
          <div>
            <h1 className="font-display text-[28px] font-bold text-[#2c150c] tracking-tight leading-none">
              Create Account
            </h1>
            <p className="text-sm text-[#6e584f] font-medium mt-1.5">
              Join thousands enjoying homemade food
            </p>
          </div>

          <div className="flex flex-col gap-2.5 mt-2">
            <div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] w-4 h-4" />
                <input type="text" placeholder="Full Name" className="h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-11 pr-4 text-sm text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('fullName')} />
              </div>
              {errors.fullName && <p className="text-[10px] text-red-600 ml-2 mt-1">{errors.fullName.message as string}</p>}
            </div>

            <div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] w-4 h-4" />
                <input type="email" autoCapitalize="none" autoCorrect="off" placeholder="Email address" className="lowercase h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-11 pr-4 text-sm text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('email')} />
              </div>
              {errors.email && <p className="text-[10px] text-red-600 ml-2 mt-1">{errors.email.message as string}</p>}
            </div>

            <div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] w-4 h-4" />
                <input type="tel" placeholder="Mobile number" className="h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-11 pr-4 text-sm text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('phone')} />
              </div>
              {errors.phone && <p className="text-[10px] text-red-600 ml-2 mt-1">{errors.phone.message as string}</p>}
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] w-4 h-4" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Password" className="h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-11 pr-10 text-sm text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('password')} />
                <button aria-label="Button action" type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a4a44] p-1.5">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
              {errors.password && <p className="text-[10px] text-red-600 ml-2 mt-1">{errors.password.message as string}</p>}
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4a44] w-4 h-4" />
                <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" className="h-12 w-full rounded-xl border border-[#e8ded2] bg-white pl-11 pr-10 text-sm text-[#2c150c] focus:outline-none focus:border-[#5c1417] focus:ring-1 focus:ring-[#5c1417]" {...register('confirmPassword')} />
                <button aria-label="Button action" type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a4a44] p-1.5">{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
              {errors.confirmPassword && <p className="text-[10px] text-red-600 ml-2 mt-1">{errors.confirmPassword.message as string}</p>}
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-[#5c4a42] font-medium mt-1">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-[#e8ded2] text-[#5c1417] focus:ring-[#5c1417]" {...register('agreed')} />
            <span className="leading-tight">I agree to the <Link to="/terms" className="font-bold text-[#5c1417] underline">Terms of Service</Link> & <Link to="/privacy" className="font-bold text-[#5c1417] underline">Privacy Policy</Link></span>
          </label>
          {errors.agreed && <p className="text-[10px] text-red-600 ml-2 -mt-1">{errors.agreed.message as string}</p>}

          {formError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg text-center">{formError}</p>}

          <button aria-label="Button action" type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl bg-[#5c1417] hover:bg-[#470f12] text-white font-semibold text-base shadow-md transition-colors mt-2 flex justify-center items-center">
            {isSubmitting ? <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Create Account'}
          </button>

          <div className="relative flex items-center justify-center w-full my-2">
            <div className="w-full border-t border-[#e8ded2]" />
            <span className="absolute bg-[#fbf5ed] px-3 text-[10px] font-bold text-[#5a4a44] uppercase tracking-widest rounded-full">Or</span>
          </div>

          <button aria-label="Button action" type="button" onClick={handleGoogleSignUpClick} disabled={googleLoading} className="w-full h-12 rounded-xl border border-[#e8ded2] bg-white text-[#2c150c] font-semibold text-sm flex items-center justify-center gap-3 shadow-sm">
            {googleLoading ? <span className="animate-spin h-4 w-4 border-2 border-[#8c746a] border-t-[#2c150c] rounded-full" /> : (
              <><svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.03 0 2.805 3.033 1.056 7.378l4.21 2.387z" /><path fill="#FBBC05" d="M16.04 15.345c-1.07.728-2.456 1.164-4.04 1.164a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388c2.4 4.745 7.35 8.018 13.04 8.018a11.83 11.83 0 0 0 8.082-3.155l-3.83-3.072c-.886.6-1.99.982-3.108.982z" /><path fill="#4285F4" d="M23.49 12.273c0-.818-.073-1.609-.208-2.373H12v4.545h6.455a5.54 5.54 0 0 1-2.409 3.636l3.83 3.072c2.236-2.063 3.614-5.109 3.614-8.88z" /><path fill="#34A853" d="M12 24c3.24 0 5.955-1.073 7.94-2.918l-3.83-3.073c-1.077.727-2.463 1.163-4.11 1.163a7.08 7.08 0 0 1-6.734-4.856l-4.21 2.388C2.805 20.967 7.03 24 12 24z" /></svg>Continue with Google</>
            )}
          </button>
        </form>

        <p className="mt-3 text-center text-sm text-[#6e584f] font-medium">
          Already have an account? <Link to="/login" className="font-bold text-[#5c1417] hover:underline">Sign In</Link>
        </p>
      </div>
    </MobileAuthLayout>
  );
}