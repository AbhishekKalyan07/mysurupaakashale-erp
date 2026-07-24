import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/lib/queryClient';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { AppRouter } from './AppRouter';
import { Toaster } from 'react-hot-toast';
import { OfflineGuard } from '@/shared/components/feedback/OfflineState';

export function App() {
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
