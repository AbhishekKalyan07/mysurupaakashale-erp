import { useState } from 'react';
import { Menu, LogOut } from 'lucide-react';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS } from '@/shared/constants/roles';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, role, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const initial = profile?.fullName.trim().charAt(0).toUpperCase() || '?';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-rice-200 bg-rice-25 px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-ink-600 hover:bg-rice-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink-900">{profile?.fullName || 'Loading…'}</p>
          {role && <p className="text-xs text-ink-500">{ROLE_LABELS[role]}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-turmeric-400 font-display text-sm text-leaf-900">
          {initial}
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut} isLoading={isSigningOut} aria-label="Sign out">
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
