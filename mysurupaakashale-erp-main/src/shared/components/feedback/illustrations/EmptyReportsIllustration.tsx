import type { SVGProps } from 'react';

export function EmptyReportsIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="60" cy="60" r="50" fill="var(--color-rice-100)" />
      
      {/* Chart bars */}
      <rect x="35" y="65" width="12" height="20" rx="2" fill="var(--color-leaf-300)" />
      <rect x="55" y="45" width="12" height="40" rx="2" fill="var(--color-turmeric-400)" />
      <rect x="75" y="55" width="12" height="30" rx="2" fill="var(--color-leaf-500)" />
      
      {/* Base line */}
      <path d="M25 85H95" stroke="var(--color-ink-300)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
