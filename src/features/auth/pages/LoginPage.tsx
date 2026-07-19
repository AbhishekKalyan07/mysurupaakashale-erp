import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { signIn, mapAuthError } from '../services/authService';
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
      // Land back where they were headed if we know it; ProtectedRoute will
      // still bounce them to their own role home if it turns out to be the
      // wrong subtree for their role.
      navigate(from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setFormError(mapAuthError(err));
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage your meals and deliveries.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting} className="mt-2">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        New to Mysuru Paakashale?{' '}
        <Link to="/signup" className="font-medium text-leaf-700 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-8 text-center text-xs text-ink-400">
        Kitchen, Delivery, and Accounts staff — sign in with the account your Admin set up for you.
      </p>
    </AuthLayout>
  );
}
