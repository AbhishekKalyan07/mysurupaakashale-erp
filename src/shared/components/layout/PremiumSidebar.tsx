import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ROLE_LABELS, type Role } from '@/shared/constants/roles';
import { NAV_ITEMS_BY_ROLE } from './navConfig';

interface PremiumSidebarProps {
  role: Role;
  isOpen: boolean; // Mobile slide-in state
  onClose: () => void;
}

export function PremiumSidebar({ role, isOpen, onClose }: PremiumSidebarProps) {
  const items = NAV_ITEMS_BY_ROLE[role];
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', isCollapsed.toString());
    } catch (error) {
      // Ignore QuotaExceededError or storage disabled errors
      console.warn('Failed to save sidebar state to localStorage', error);
    }
  }, [isCollapsed]);

  const desktopWidth = isCollapsed ? 'w-[72px]' : 'w-[260px]';

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out',
          'bg-gradient-to-b from-sidebar to-sidebar-secondary',
          'border-r border-primary/10 shadow-xl lg:static',
          'overflow-hidden',
          // Mobile: hidden off-screen by default, slides in when isOpen
          isOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0',
          desktopWidth
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-5 shrink-0 border-b border-primary/10">
          <div className="flex items-center gap-3 overflow-hidden">
            <img src="/no_bg_logo.webp" alt="Mysuru Paakashale Logo" width="32" height="32" className="h-8 w-auto shrink-0 drop-shadow-sm" />
            <div
              className={cn(
                "leading-tight overflow-hidden whitespace-nowrap transition-all duration-300",
                isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
              )}
            >
              <p className="font-display text-[14px] font-bold text-primary tracking-wide leading-tight">
                Mysuru Paakashale
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-semibold leading-tight">
                {ROLE_LABELS[role]}
              </p>
            </div>
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-primary/50 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            aria-label="Toggle Sidebar"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden flex w-7 h-7 items-center justify-center rounded-lg text-primary/50 hover:text-primary hover:bg-primary/10 transition-colors shrink-0 ml-auto"
            aria-label="Close Sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Primary navigation" className="flex-1 space-y-6 px-3 py-5 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {items.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-0.5">
              {group.groupLabel && (
                <div
                  className={cn(
                    "px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-primary/40 mb-1 overflow-hidden transition-all duration-300",
                    isCollapsed ? "opacity-0 h-0" : "opacity-100 h-auto"
                  )}
                >
                  {group.groupLabel}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/dashboard'}
                    onClick={onClose}
                    title={isCollapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium',
                        'transition-all duration-150 group relative',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-primary/60 hover:bg-primary/5 hover:text-primary',
                        isCollapsed ? 'justify-center' : 'justify-start'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div
                            className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full animate-in fade-in"
                          />
                        )}
                        <Icon
                          size={18}
                          strokeWidth={isActive ? 2.5 : 1.8}
                          className={cn(
                            'shrink-0 transition-colors',
                            isActive ? 'text-primary' : 'text-primary/60 group-hover:text-primary'
                          )}
                        />
                        <span
                          className={cn(
                            "whitespace-nowrap overflow-hidden leading-tight transition-all duration-300",
                            isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
                          )}
                        >
                          {label}
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer branding dot */}
        <div className="px-5 py-4 border-t border-primary/10 shrink-0">
          <div
            className={cn(
              "flex items-center gap-2 transition-opacity duration-300",
              isCollapsed ? "opacity-0" : "opacity-100"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
            <span className="text-[10px] text-primary/50 font-medium truncate">System Online</span>
          </div>
        </div>
      </aside>
    </>
  );
}
