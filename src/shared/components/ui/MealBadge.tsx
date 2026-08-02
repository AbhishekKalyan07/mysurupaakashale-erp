import { cn } from '@/shared/lib/cn';
import type { MealType } from '@/shared/types';

interface MealBadgeProps {
  mealType: MealType;
  compact?: boolean;
  className?: string;
}

const MEAL_CONFIG: Record<MealType, { label: string; emoji: string; bg: string; text: string }> = {
  breakfast: { label: 'Breakfast', emoji: '🌅', bg: 'bg-[#FFF8E1]', text: 'text-[#FF8F00]' },
  lunch:     { label: 'Lunch',     emoji: '🍛', bg: 'bg-success-subtle', text: 'text-success' },
  dinner:    { label: 'Dinner',    emoji: '🌙', bg: 'bg-info-subtle', text: 'text-info' },
};

export function MealBadge({ mealType, compact = false, className }: MealBadgeProps) {
  const config = MEAL_CONFIG[mealType] ?? { label: mealType, emoji: '🍽️', bg: 'bg-surface-2', text: 'text-text-muted' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold border border-black/8',
        config.bg,
        config.text,
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}
