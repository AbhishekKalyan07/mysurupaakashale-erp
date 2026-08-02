import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isCollapsed.toString());
  }, [isCollapsed]);

  const desktopWidth = isCollapsed ? 'w-[72px]' : 'w-[260px]';

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 260 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col',
          'bg-gradient-to-b from-sidebar to-sidebar-secondary',
          'border-r border-white/8 shadow-xl lg:static',
          'overflow-hidden',
          // Mobile: hidden off-screen by default, slides in when isOpen
          isOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0',
          desktopWidth
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-5 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3 overflow-hidden">
            <img src="/favicon.svg" alt="Logo" className="h-7 w-7 shrink-0 drop-shadow" />
            <motion.div
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto' }}
              transition={{ duration: 0.18 }}
              className="leading-tight overflow-hidden whitespace-nowrap"
            >
              <p className="font-display text-[14px] font-bold text-white tracking-wide leading-tight">
                Mysuru Paakashale
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold font-semibold leading-tight">
                {ROLE_LABELS[role]}
              </p>
            </motion.div>
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Toggle Sidebar"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden flex w-7 h-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0 ml-auto"
            aria-label="Close Sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 px-3 py-5 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {items.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-0.5">
              {group.groupLabel && (
                <motion.div
                  initial={false}
                  animate={{ opacity: isCollapsed ? 0 : 1, height: isCollapsed ? 0 : 'auto' }}
                  className="px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35 mb-1 overflow-hidden"
                >
                  {group.groupLabel}
                </motion.div>
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
                          ? 'bg-white/12 text-white'
                          : 'text-white/60 hover:bg-white/8 hover:text-white',
                        isCollapsed ? 'justify-center' : 'justify-start'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.div
                            layoutId="sidebarActiveIndicator"
                            className="absolute left-0 top-2 bottom-2 w-0.5 bg-gold rounded-r-full"
                            transition={{ duration: 0.2 }}
                          />
                        )}
                        <Icon
                          size={18}
                          strokeWidth={isActive ? 2.5 : 1.8}
                          className={cn(
                            'shrink-0 transition-colors',
                            isActive ? 'text-gold' : 'text-white/60 group-hover:text-white'
                          )}
                        />
                        <motion.span
                          initial={false}
                          animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto' }}
                          className="whitespace-nowrap overflow-hidden leading-tight"
                        >
                          {label}
                        </motion.span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer branding dot */}
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          <motion.div
            initial={false}
            animate={{ opacity: isCollapsed ? 0 : 1 }}
            className="flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
            <span className="text-[10px] text-white/35 font-medium truncate">System Online</span>
          </motion.div>
        </div>
      </motion.aside>
    </>
  );
}
