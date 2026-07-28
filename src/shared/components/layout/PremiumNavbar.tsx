import { useState } from 'react';
import { Menu, LogOut } from 'lucide-react';
import { PremiumButton } from '@/shared/components/ui/PremiumButton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS, type Role } from '@/shared/constants/roles';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

interface PremiumNavbarProps {
  onMenuClick: () => void;
  role: Role;
}

export function PremiumNavbar({ onMenuClick, role }: PremiumNavbarProps) {
  const { profile, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const initial = profile?.fullName?.trim().charAt(0).toUpperCase() || '?';

  const timeString = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-white/80 backdrop-blur-md px-6 shadow-sm border-b border-gold/20">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 text-text-muted hover:text-primary transition-colors lg:hidden rounded-lg hover:bg-background"
          aria-label="Open sidebar"
        >
          <Menu size={24} />
        </button>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-2 text-sm font-medium text-text-muted border-r border-gold/30 pr-6">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          {timeString}
        </div>

        <NotificationBell centerRoute={role === 'customer' ? '/customer/notifications' : '/admin/notifications'} />
        
        <div className="flex items-center gap-3 pl-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-primary">{profile?.fullName || 'Loading…'}</p>
            {role && <p className="text-xs text-text-muted font-medium">{ROLE_LABELS[role]}</p>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary font-display text-sm font-bold text-white shadow-sm border border-gold/30">
            {initial}
          </div>
          <PremiumButton variant="ghost" size="sm" onClick={handleSignOut} isLoading={isSigningOut} aria-label="Sign out" className="ml-1 px-2 text-text-muted hover:text-danger hover:bg-danger/10">
            <LogOut size={18} />
          </PremiumButton>
        </div>
      </div>
    </header>
  );
}
