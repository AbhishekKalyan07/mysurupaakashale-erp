import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
}

export function PageHeader({ title, breadcrumbs = [], actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {breadcrumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1.5 text-sm text-leaf-500">
            {breadcrumbs.map((bc, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  {bc.href && !isLast ? (
                    <Link to={bc.href} className="hover:text-leaf-800 transition-colors">
                      {bc.label}
                    </Link>
                  ) : (
                    <span className={clsx(isLast ? 'text-leaf-800 font-medium' : '')}>
                      {bc.label}
                    </span>
                  )}
                  {!isLast && <ChevronRight size={14} />}
                </div>
              );
            })}
          </nav>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-leaf-900 sm:text-3xl">
          {title}
        </h1>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
