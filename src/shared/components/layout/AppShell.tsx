import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { PremiumSidebar } from './PremiumSidebar';
import { PremiumNavbar } from './PremiumNavbar';
import { GlobalErrorBoundary } from '../feedback/GlobalErrorBoundary';
import { animations } from '@/theme/animations';

export function AppShell() {
  const { status, role, profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  if (status !== 'authenticated' || !role) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-dvh bg-background overflow-hidden">
      <PremiumSidebar role={role} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <PremiumNavbar role={role} onMenuClick={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-6 lg:p-8">
          <GlobalErrorBoundary>
            {profile ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  variants={animations.motion.pageFade}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="mx-auto max-w-7xl h-full"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            ) : (
              <LoadingScreen />
            )}
          </GlobalErrorBoundary>
        </main>
      </div>
    </div>
  );
}
