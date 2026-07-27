import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MobileLoginPage } from './MobileLoginPage';
import { DesktopLoginPage } from './DesktopLoginPage';

export function LoginPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return <DesktopLoginPage />;
  }
  return <MobileLoginPage />;
}
