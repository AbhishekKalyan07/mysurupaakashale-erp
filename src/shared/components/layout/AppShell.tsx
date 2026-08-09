import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { PremiumSidebar } from './PremiumSidebar';
import { PremiumNavbar } from './PremiumNavbar';
import { BottomNav } from './BottomNav';
import { GlobalErrorBoundary } from '../feedback/GlobalErrorBoundary';

export function AppShell() {
  const { status, role, profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  if (status !== 'authenticated' || !role) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-dvh bg-background overflow-hidden">
      {/* Sidebar — visible on desktop, slide-in on mobile via hamburger */}
      <PremiumSidebar role={role} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar — kept on both mobile and desktop, hamburger menu on mobile */}
        <PremiumNavbar role={role} onMenuClick={() => setIsSidebarOpen(true)} />
        
        {/* Page content — bottom padding on mobile for bottom nav */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background px-4 py-5 lg:p-8 pb-[76px] lg:pb-8">
          <GlobalErrorBoundary>
            {profile ? (
              <div key={location.pathname} className="mx-auto max-w-7xl h-full animate-in fade-in duration-300">
                <Outlet />
              </div>
            ) : (
              <LoadingScreen />
            )}
          </GlobalErrorBoundary>
        </main>
      </div>

      {/* Bottom Nav — mobile only (lg:hidden is inside BottomNav) */}
      <BottomNav role={role} />
    </div>
  );
}
