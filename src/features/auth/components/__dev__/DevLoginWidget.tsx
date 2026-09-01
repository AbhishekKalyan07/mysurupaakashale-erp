import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signOutUser } from '@/features/auth/services/authService';
import toast from 'react-hot-toast';

export function DevLoginWidget() {
  const navigate = useNavigate();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  // Safely hide this in production and when connected to live DB
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true') {
    return null;
  }

  const handleDevLogin = async (email: string, role: string) => {
    setLoadingRole(role);
    try {
      await signOutUser();
      await signIn(email, `${role}123`);
      toast.success(`Logged in as ${role}`);
      navigate('/');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        toast.error(`Test ${role} not found. Use your script to seed users first.`);
      } else {
        toast.error('Dev login failed: ' + error.message);
      }
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <div className="mt-6 border-t-2 border-dashed border-red-300 pt-4 pb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-red-600 uppercase tracking-wider">
          🛠️ Dev Tools (Emulator Only)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleDevLogin('admin@mysuru.com', 'admin')}
          disabled={loadingRole !== null}
          className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-2 px-3 rounded-lg border border-red-200 transition-colors"
        >
          {loadingRole === 'admin' ? '...' : 'Login Admin'}
        </button>
        <button
          type="button"
          onClick={() => handleDevLogin('customer@mysuru.com', 'customer')}
          disabled={loadingRole !== null}
          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2 px-3 rounded-lg border border-blue-200 transition-colors"
        >
          {loadingRole === 'customer' ? '...' : 'Login Customer'}
        </button>
        <button
          type="button"
          onClick={() => handleDevLogin('kitchen@mysuru.com', 'kitchen')}
          disabled={loadingRole !== null}
          className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-semibold py-2 px-3 rounded-lg border border-green-200 transition-colors"
        >
          {loadingRole === 'kitchen' ? '...' : 'Login Kitchen'}
        </button>
        <button
          type="button"
          onClick={() => handleDevLogin('delivery@mysuru.com', 'delivery')}
          disabled={loadingRole !== null}
          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-2 px-3 rounded-lg border border-amber-200 transition-colors"
        >
          {loadingRole === 'delivery' ? '...' : 'Login DP'}
        </button>
      </div>
    </div>
  );
}
