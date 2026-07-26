import type { SVGProps } from 'react';

export function EmptyInventoryIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="60" cy="60" r="50" fill="var(--color-rice-100)" />
      
      {/* Box */}
      <path d="M60 35L35 48V78L60 91L85 78V48L60 35Z" fill="white" stroke="var(--color-rice-300)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M35 48L60 61L85 48" stroke="var(--color-rice-300)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 91V61" stroke="var(--color-rice-300)" strokeWidth="2" strokeLinejoin="round" />
      
      {/* Tape on box */}
      <path d="M55 45L65 50" stroke="var(--color-turmeric-400)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
