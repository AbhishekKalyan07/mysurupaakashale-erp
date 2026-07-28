import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ROLE_LABELS, type Role } from '@/shared/constants/roles';
import { NAV_ITEMS_BY_ROLE } from './navConfig';

interface PremiumSidebarProps {
  role: Role;
  isOpen: boolean; // Mobile open state
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

  const desktopWidth = isCollapsed ? 'w-[80px]' : 'w-[320px]';

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-primary/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 320 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-gradient-to-b from-primary to-secondary border-r border-gold/30 shadow-lg lg:static overflow-hidden',
          // On mobile, it's either full width (minus margins) or completely hidden off-screen
          isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0',
          desktopWidth
        )}
      >
        {/* Header Area */}
        <div className="flex h-20 items-center justify-between px-6 shrink-0 border-b border-gold/10">
          <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap">
            <img src="/favicon.svg" alt="Logo" className="h-8 w-8 shrink-0 drop-shadow-md" />
            <motion.div 
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto' }}
              transition={{ duration: 0.2 }}
              className="leading-tight"
            >
              <p className="font-display text-[15px] font-bold text-white tracking-wide">Mysuru Paakashale</p>
              <p className="text-[11px] uppercase tracking-widest text-gold">{ROLE_LABELS[role]}</p>
            </motion.div>
          </div>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex text-gold/60 hover:text-gold transition-colors shrink-0"
            aria-label="Toggle Sidebar"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          
          <button
            onClick={onClose}
            className="lg:hidden flex text-gold/60 hover:text-gold transition-colors shrink-0 ml-auto"
            aria-label="Close Sidebar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-8 px-4 py-6 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {items.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-2">
              {group.groupLabel && (
                <motion.div
                  initial={false}
                  animate={{ opacity: isCollapsed ? 0 : 1, height: isCollapsed ? 0 : 'auto' }}
                  className="px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gold/60"
                >
                  {group.groupLabel}
                </motion.div>
              )}
              <div className="space-y-1">
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/dashboard'}
                    onClick={onClose}
                    title={isCollapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-4 rounded-[12px] px-4 py-3 text-sm font-medium transition-all duration-200 group relative',
                        isActive
                          ? 'bg-white/10 text-gold shadow-sm'
                          : 'text-white/70 hover:bg-white/5 hover:text-white',
                        isCollapsed ? 'justify-center' : 'justify-start'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.div
                            layoutId="activeIndicator"
                            className="absolute left-0 w-1 h-1/2 bg-gold rounded-r-full"
                            transition={{ duration: 0.25 }}
                          />
                        )}
                        <Icon size={20} className={cn('shrink-0 transition-transform duration-200 group-hover:scale-110', isActive ? 'text-gold' : '')} />
                        <motion.span
                          initial={false}
                          animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto' }}
                          className="whitespace-nowrap overflow-hidden"
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
      </motion.aside>
    </>
  );
}
