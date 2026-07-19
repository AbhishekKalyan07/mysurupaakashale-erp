import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Use this (not bare `clsx`) specifically where a component merges an
 * external `className` prop with its own internal Tailwind classes.
 * `clsx` alone only concatenates strings — if a consumer passes
 * `className="p-6"` into a component whose internal classes already
 * include `p-4`, both end up in the class list and which one visually
 * wins depends on Tailwind's generated stylesheet order, not the order
 * they appear in the string. `twMerge` resolves that by recognizing which
 * classes occupy the same "slot" (e.g. padding) and keeping only the
 * last one — so the external override always wins, predictably.
 *
 * Where a component's `clsx()` call has no external className involved —
 * just internal, mutually-exclusive conditional branches (e.g. an
 * active/inactive nav link style) — plain `clsx` is still the right tool:
 * there's no override to resolve, and it avoids `twMerge`'s parsing cost
 * for no benefit.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
