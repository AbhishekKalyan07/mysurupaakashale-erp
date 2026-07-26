import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalErrorBoundary } from '../feedback/GlobalErrorBoundary';

/**
 * Rendered inside <ProtectedRoute>, so `status === 'authenticated'` and
 * `role` are already guaranteed — the checks below are just a type-safety
 * net plus the brief window where `profile`'s own onSnapshot hasn't
 * delivered its first value yet.
 */
export function AppShell() {
  const { status, role, profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (status !== 'authenticated' || !role) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-dvh bg-rice-50">
      <Sidebar role={role} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex flex-1 flex-col">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <GlobalErrorBoundary>
            {profile ? <Outlet /> : <LoadingScreen />}
          </GlobalErrorBoundary>
        </main>
      </div>
    </div>
  );
}
