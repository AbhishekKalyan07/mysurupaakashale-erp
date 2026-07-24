import type { SVGProps } from 'react';

export function EmptySubscriptionsIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="60" cy="60" r="50" fill="var(--color-rice-100)" />
      
      {/* Calendar body */}
      <rect x="35" y="40" width="50" height="50" rx="6" fill="white" stroke="var(--color-rice-300)" strokeWidth="2" />
      <path d="M35 55H85" stroke="var(--color-rice-300)" strokeWidth="2" />
      
      {/* Calendar rings */}
      <rect x="45" y="32" width="4" height="16" rx="2" fill="var(--color-turmeric-400)" />
      <rect x="71" y="32" width="4" height="16" rx="2" fill="var(--color-turmeric-400)" />
      
      {/* Content dots */}
      <circle cx="50" cy="68" r="3" fill="var(--color-rice-200)" />
      <circle cx="60" cy="68" r="3" fill="var(--color-rice-200)" />
      <circle cx="70" cy="68" r="3" fill="var(--color-leaf-400)" />
      <circle cx="50" cy="78" r="3" fill="var(--color-leaf-400)" />
    </svg>
  );
}
