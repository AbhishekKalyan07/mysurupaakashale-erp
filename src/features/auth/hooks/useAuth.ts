import { useContext } from 'react';
import { AuthContext } from '../context/authContextInstance';
import type { AuthContextValue } from '../types/auth.types';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be called within an <AuthProvider>.');
  }
  return context;
}
