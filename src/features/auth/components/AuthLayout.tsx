import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Brand panel: hidden on phones, shown from lg up — mobile gets the compact header below instead. */}
      <div className="relative hidden flex-col justify-between bg-leaf-800 p-10 text-rice-25 lg:flex">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-lg">Mysuru Paakashale</span>
        </div>
        <blockquote className="font-display text-2xl leading-snug text-rice-50">
          Home-style breakfast, lunch and dinner — delivered to your door, every single day.
        </blockquote>
        <p className="text-sm text-leaf-200">© {new Date().getFullYear()} Mysuru Paakashale</p>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-base text-ink-900">Mysuru Paakashale</span>
          </div>
          <h1 className="font-display text-2xl text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
