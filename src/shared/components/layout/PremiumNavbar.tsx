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

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 lg:h-16 items-center justify-between bg-card/90 backdrop-blur-md px-4 lg:px-6 border-b border-border">
      {/* Left: hamburger + brand name on mobile */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-1 text-text-muted hover:text-primary hover:bg-surface-2 transition-colors rounded-[10px]"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        {/* Brand shown on mobile only (sidebar shows brand on desktop) */}
        <div className="lg:hidden">
          <p className="font-display text-sm font-bold text-primary leading-tight">Mysuru Paakashale</p>
          <p className="text-[10px] uppercase tracking-widest text-gold font-semibold">{ROLE_LABELS[role]}</p>
        </div>
      </div>

      {/* Right: notification bell + avatar + sign out */}
      <div className="flex items-center gap-2">
        <NotificationBell centerRoute={role === 'customer' ? '/customer/notifications' : '/admin/notifications'} />
        
        {/* Profile info — hidden on mobile to save space */}
        <div className="hidden sm:flex items-center gap-2 pl-1">
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold text-text leading-tight">{profile?.fullName || 'Loading…'}</p>
            {role && <p className="text-[11px] text-text-muted font-medium leading-tight">{ROLE_LABELS[role]}</p>}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary font-display text-sm font-bold text-white shadow-xs border-2 border-white">
            {initial}
          </div>
        </div>

        {/* Avatar on mobile only */}
        <div className="sm:hidden flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary font-bold text-white text-sm shadow-xs border-2 border-white">
          {initial}
        </div>

        <PremiumButton
          variant="ghost"
          size="icon-sm"
          onClick={handleSignOut}
          isLoading={isSigningOut}
          aria-label="Sign out"
          className="text-text-muted hover:text-danger hover:bg-danger-subtle"
        >
          <LogOut size={17} />
        </PremiumButton>
      </div>
    </header>
  );
}
