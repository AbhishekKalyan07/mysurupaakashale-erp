import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { signUpCustomer, signInWithGoogle, mapAuthError } from '../services/authService';
import { AuthLayout } from '../components/AuthLayout';
import type { SignupFormValues } from '../types/auth.types';

const INDIAN_MOBILE_REGEX = /^(?:\+91[-\s]?)?[6-9]\d{9}$/;

const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    phone: z.string().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit mobile number'),
    password: z.string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupFormValues) => {
    setFormError(null);
    try {
      await signUpCustomer(values.email, values.password, values.fullName, values.phone);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Set up home-style meals, delivered daily.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Full name"
          autoComplete="name"
          required
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          placeholder="98765 43210"
          error={errors.phone?.message}
          helperText={!errors.phone ? "We'll use this to reach you about deliveries." : undefined}
          {...register('phone')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting} className="mt-2">
          Create account
        </Button>
        <Button type="button" onClick={handleGoogleSignIn} variant="secondary" className="mt-2 flex items-center gap-2 justify-center">
          Continue with Google
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-leaf-700 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
