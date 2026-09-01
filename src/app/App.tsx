import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/lib/queryClient';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { AppRouter } from './AppRouter';
import { Toaster } from 'react-hot-toast';
import { OfflineGuard } from '@/shared/components/feedback/OfflineState';
import { appCheckConfigError } from '@/shared/lib/firebase';

export function App() {
  // Block the entire app if a critical configuration is missing.
  // React mounts (so this screen is visible), but no authenticated
  // functionality is exposed — the user sees a clear error message
  // instead of an infinite loading spinner.
  if (appCheckConfigError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif',
        background: '#1a1a2e', color: '#e0e0e0', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: '1.5rem', color: '#ff6b6b', marginBottom: '1rem' }}>
            ⚠️ Configuration Error
          </h1>
          <p style={{ lineHeight: 1.6, marginBottom: '1rem' }}>{appCheckConfigError}</p>
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            Contact the system administrator or check the deployment environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineGuard>
          <AppRouter />
          <Toaster position="top-right" />
        </OfflineGuard>
      </AuthProvider>
    </QueryClientProvider>
  );
}
