import type { SVGProps } from 'react';

export function EmptyOrdersIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="60" cy="60" r="50" fill="var(--color-rice-100)" />
      
      {/* Receipt body */}
      <path d="M35 30H85V95L75 88L65 95L55 88L45 95L35 88V30Z" fill="white" stroke="var(--color-rice-300)" strokeWidth="2" strokeLinejoin="round" />
      
      {/* Lines on receipt */}
      <rect x="45" y="45" width="30" height="4" rx="2" fill="var(--color-rice-200)" />
      <rect x="45" y="55" width="20" height="4" rx="2" fill="var(--color-rice-200)" />
      <rect x="45" y="65" width="25" height="4" rx="2" fill="var(--color-rice-200)" />
      
      {/* Accent leaf */}
      <circle cx="85" cy="35" r="14" fill="var(--color-leaf-100)" />
      <path d="M85 28C81.134 28 78 31.134 78 35C78 38.866 81.134 42 85 42C88.866 42 92 38.866 92 35C92 31.134 88.866 28 85 28Z" stroke="var(--color-leaf-600)" strokeWidth="2" />
    </svg>
  );
}
