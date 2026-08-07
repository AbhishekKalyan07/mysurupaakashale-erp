import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { ROLE_LABELS, type Role } from '@/shared/constants/roles';
import { NAV_ITEMS_BY_ROLE } from './navConfig';

interface SidebarProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const items = NAV_ITEMS_BY_ROLE[role];

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-leaf-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-leaf-800 text-rice-25 shadow-nav transition-transform duration-200 lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <img src="/no_bg_logo.png" alt="Mysuru Paakashale Logo" className="h-8 w-auto shrink-0" />
          <div className="leading-tight">
            <p className="font-display text-sm">Mysuru Paakashale</p>
            <p className="text-xs text-leaf-300">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-6 px-3 py-4 overflow-y-auto overflow-x-hidden no-scrollbar">
          {items.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.groupLabel && (
                <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-leaf-300">
                  {group.groupLabel}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/dashboard'} // only strict end for dashboard so sub-routes stay active
                    onClick={onClose}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-turmeric-400 bg-leaf-700 text-rice-25'
                          : 'border-transparent text-leaf-100 hover:bg-leaf-700/60 hover:text-rice-25',
                      )
                    }
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
