import { Wrench } from 'lucide-react';

export interface MaintenanceModeProps {
  title?: string;
  description?: string;
  estimatedTime?: string;
}

/**
 * Full-page maintenance screen. Render this at the top level (e.g., in App.tsx)
 * when a `maintenance` flag is active in your business settings.
 * 
 * DO NOT use the existing routing — render directly before the router.
 */
export function MaintenanceMode({
  title = 'System Under Maintenance',
  description = "We're making improvements to serve you better. Normal service will resume shortly.",
  estimatedTime,
}: MaintenanceModeProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-rice-50 px-6 text-center">
      {/* Logo area */}
      <div className="space-y-1">
        <p className="font-display text-2xl font-bold text-leaf-700">Mysuru Paakashale</p>
        <p className="text-xs text-ink-500 uppercase tracking-widest font-sans">ERP</p>
      </div>

      {/* Illustration */}
      <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-turmeric-50 border-2 border-turmeric-200">
        <Wrench size={52} className="text-turmeric-600" strokeWidth={1.5} />
        <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-turmeric-400 text-white">
          <span className="text-xs font-bold">!</span>
        </span>
      </div>

      <div className="space-y-3 max-w-md">
        <h1 className="font-display text-3xl font-bold text-ink-900">{title}</h1>
        <p className="text-base text-ink-500 leading-relaxed">{description}</p>
        {estimatedTime && (
          <p className="text-sm font-medium text-turmeric-700 bg-turmeric-50 border border-turmeric-200 rounded-lg px-4 py-2 inline-block">
            Estimated back: {estimatedTime}
          </p>
        )}
      </div>

      {/* Animated dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-turmeric-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <p className="text-xs text-ink-500">
        If you have questions, contact us at{' '}
        <a href="mailto:support@mysurupaakashale.in" className="text-leaf-600 underline hover:text-leaf-700">
          support@mysurupaakashale.in
        </a>
      </p>
    </div>
  );
}
