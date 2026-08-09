interface HeroBannerProps {
  userName?: string;
  subtitle?: string;
  title?: string;
  actions?: React.ReactNode;
}

export function HeroBanner({ userName, title, subtitle = 'Mysuru Paakashale ERP', actions }: HeroBannerProps) {
  const displayTitle = title || userName || 'Dashboard';

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-text leading-tight truncate">
          {displayTitle}
        </h1>
        <p className="text-sm text-text-muted mt-0.5 leading-tight">
          {subtitle}
        </p>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
