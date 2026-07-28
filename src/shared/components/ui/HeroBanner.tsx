import { motion } from 'framer-motion';
import { animations } from '@/theme/animations';

interface HeroBannerProps {
  userName?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function HeroBanner({ userName, subtitle = 'Mysuru Paakashale ERP', actions }: HeroBannerProps) {
  return (
    <motion.div
      variants={animations.motion.heroSlideUp}
      initial="initial"
      animate="animate"
      className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-ink-900 mb-1">
          {userName || 'Dashboard'}
        </h1>
        <p className="text-sm text-ink-500 max-w-2xl">
          {subtitle}
        </p>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </motion.div>
  );
}
