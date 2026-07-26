import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';

interface RequireCompleteProfileProps {
  children: React.ReactNode;
}

/**
 * A guard component for Customer routes.
 * It checks if the customer's profile is complete (has a phone number).
 * If not, it redirects them to the Profile page to complete onboarding.
 */
export function RequireCompleteProfile({ children }: RequireCompleteProfileProps) {
  const { profile, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  // If there's no profile, or the profile is missing a phone number
  // and we are NOT already on the profile page, redirect them.
  const isProfileComplete = profile && profile.phone && profile.phone.trim().length >= 10;

  if (!isProfileComplete && location.pathname !== '/customer/profile') {
    return <Navigate to="/customer/profile?onboarding=true" replace />;
  }

  return <>{children}</>;
}
