import type { SVGProps } from 'react';

export function EmptyCustomersIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="60" cy="60" r="50" fill="var(--color-rice-100)" />
      
      {/* Background card */}
      <rect x="25" y="40" width="70" height="50" rx="8" fill="white" stroke="var(--color-rice-300)" strokeWidth="2" />
      <circle cx="60" cy="56" r="10" fill="var(--color-rice-200)" />
      <path d="M45 78C45 74.6863 47.6863 72 51 72H69C72.3137 72 75 74.6863 75 78V80H45V78Z" fill="var(--color-rice-200)" />
      
      {/* Foreground accent */}
      <circle cx="85" cy="85" r="14" fill="var(--color-turmeric-100)" />
      <path d="M85 79V91M79 85H91" stroke="var(--color-turmeric-500)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
