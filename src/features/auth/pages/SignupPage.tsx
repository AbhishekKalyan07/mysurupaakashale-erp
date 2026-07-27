import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MobileSignupPage } from './MobileSignupPage';
import { DesktopSignupPage } from './DesktopSignupPage';

export function SignupPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return <DesktopSignupPage />;
  }
  return <MobileSignupPage />;
}
