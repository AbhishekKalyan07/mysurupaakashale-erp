import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PWAInstallPrompt } from '../PWAInstallPrompt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PWAInstallPrompt', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
      })),
    });
    // @ts-expect-error reset
    delete window.navigator.standalone;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders correctly after 3 seconds when conditions are met', () => {
    act(() => {
      root?.render(<PWAInstallPrompt />);
    });
    
    expect(container?.textContent).not.toContain('Get the App');
    
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    
    expect(container?.textContent).toContain('Get the App');
  });

  it('handles disabled localStorage gracefully without crashing', () => {
    // Mock localStorage to throw a SecurityError
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    act(() => {
      root?.render(<PWAInstallPrompt />);
    });
    
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    
    expect(container?.textContent).toContain('Get the App');

    // Find close button and click it
    const closeButton = container?.querySelector('button[aria-label="Close install prompt"]') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    
    act(() => {
      closeButton.click();
    });

    expect(container?.textContent).not.toContain('Get the App');

    // Restore localStorage
    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.setItem = originalSetItem;
  });

  it('does not render if dismissed recently', () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    
    act(() => {
      root?.render(<PWAInstallPrompt />);
    });
    
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    
    expect(container?.textContent).not.toContain('Get the App');
  });
});
