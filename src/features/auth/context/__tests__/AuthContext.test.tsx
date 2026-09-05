import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';
import { userRepository } from '@/shared/services/firestore/userRepository';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock dependencies
vi.mock('@/shared/lib/firebase', () => ({
  auth: {}
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

vi.mock('@/shared/services/firestore/userRepository', () => ({
  userRepository: {
    subscribeToDoc: vi.fn(),
  },
}));

vi.mock('../../services/authService', () => ({
  signOutUser: vi.fn(),
  handleGoogleRedirectResult: vi.fn(),
}));

const { onAuthStateChanged } = await import('firebase/auth');

function TestComponent() {
  const { status, role } = useAuth();
  return (
    <div>
      <span id="status">{status}</span>
      <span id="role">{role || 'none'}</span>
    </div>
  );
}

describe('AuthContext - Strict Firestore Resolution', () => {
  let authStateCallback: (user: any) => void;
  let firestoreCallback: (data: any) => void;
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    
    localStorage.clear();
    vi.clearAllMocks();

    (onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      authStateCallback = cb;
      return vi.fn(); // unsubscribe
    });

    (userRepository.subscribeToDoc as any).mockImplementation((_uid: string, cb: any, _errCb: any) => {
      firestoreCallback = cb;
      return vi.fn(); // unsubscribe
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container?.remove();
    container = null;
    localStorage.clear();
  });

  function renderComponent() {
    act(() => {
      root.render(<AuthProvider><TestComponent /></AuthProvider>);
    });
  }

  function getStatus() {
    return container?.querySelector('#status')?.textContent;
  }

  function getRole() {
    return container?.querySelector('#role')?.textContent;
  }

  it('1. starts as loading and remains loading after auth state changes to user', () => {
    renderComponent();
    expect(getStatus()).toBe('loading');
    
    act(() => {
      authStateCallback({ uid: 'user123', email: 'test@test.com' });
    });

    expect(getStatus()).toBe('loading');
    expect(getRole()).toBe('none');
  });

  it('2. becomes unauthenticated immediately and clears cache if auth state is null', () => {
    localStorage.setItem('auth_cache_123', 'val');
    localStorage.setItem('pwa_prompt', 'val');
    
    renderComponent();
    
    act(() => {
      authStateCallback(null);
    });

    expect(getStatus()).toBe('unauthenticated');
    expect(getRole()).toBe('none');
    expect(localStorage.getItem('auth_cache_123')).toBeNull();
    expect(localStorage.getItem('pwa_prompt')).toBeNull();
  });

  it('3. resolves to authenticated and sets role once Firestore returns valid profile', () => {
    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123', email: 'test@test.com' });
    });
    
    expect(getStatus()).toBe('loading');

    act(() => {
      firestoreCallback({ role: 'admin' });
    });

    expect(getStatus()).toBe('authenticated');
    expect(getRole()).toBe('admin');
  });

  it('4. persists role to localStorage once fetched', () => {
    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });

    act(() => {
      firestoreCallback({ role: 'customer' });
    });

    expect(getStatus()).toBe('authenticated');
    expect(JSON.parse(localStorage.getItem('auth_cache_user123')!)).toEqual({ uid: 'user123', role: 'customer' });
  });

  it('5. remains loading if Firestore profile is missing/null', () => {
    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });

    act(() => {
      firestoreCallback(null);
    });

    // Profile is missing, so it should stay loading until timeout or data creation
    expect(getStatus()).toBe('loading');
  });

  it('6. handles firestore subscription error', () => {
    let firestoreErrorCallback: any;
    (userRepository.subscribeToDoc as any).mockImplementation((_uid: string, cb: any, errCb: any) => {
      firestoreCallback = cb;
      firestoreErrorCallback = errCb;
      return vi.fn();
    });

    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });

    act(() => {
      if (firestoreErrorCallback) firestoreErrorCallback(new Error('test error'));
    });

    expect(getStatus()).toBe('unauthenticated');
  });

  it('7. handles timeout for profile load', async () => {
    vi.useFakeTimers();
    const { signOutUser } = await import('../../services/authService');
    (signOutUser as any).mockRejectedValueOnce(new Error('timeout signout error'));

    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });

    await act(async () => {
      vi.advanceTimersByTime(21000);
    });

    expect(getStatus()).toBe('unauthenticated');
    vi.useRealTimers();
  });

  it('8. dispatches app-ready event after 5s when authenticated', async () => {
    vi.useFakeTimers();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    
    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });
    
    act(() => {
      firestoreCallback({ role: 'customer' });
    });

    expect(getStatus()).toBe('authenticated');
    
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app-ready');
    
    dispatchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('9. handles deactivated user profile', async () => {
    renderComponent();
    
    act(() => {
      authStateCallback({ uid: 'user123' });
    });
    
    act(() => {
      firestoreCallback({ role: 'customer', isActive: false });
    });

    const { signOutUser } = await import('../../services/authService');
    expect(signOutUser).toHaveBeenCalled();

    act(() => {
      authStateCallback(null);
    });

    expect(getStatus()).toBe('unauthenticated');
  });

  it('10. handles onAuthStateChanged error', () => {
    let authStateErrorCallback: any;
    (onAuthStateChanged as any).mockImplementation((_auth: any, cb: any, errCb: any) => {
      authStateCallback = cb;
      authStateErrorCallback = errCb;
      return vi.fn();
    });

    renderComponent();
    
    act(() => {
      if (authStateErrorCallback) authStateErrorCallback(new Error('test auth error'));
    });

    expect(getStatus()).toBe('unauthenticated');
  });

  it('11. throws if useAuth is used outside of AuthProvider', () => {
    let error: Error | undefined;
    
    function TestErrorComponent() {
      try {
        useAuth();
      } catch (e: any) {
        error = e;
      }
      return null;
    }
    
    act(() => {
      root.render(<TestErrorComponent />);
    });
    
    expect(error).toBeDefined();
    expect(error?.message).toBe('useAuth() must be called within an <AuthProvider>.');
  });
});
