import { type SVGProps } from 'react';

export function CornerDecoration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M0 0H40V2C19.0132 2 2 19.0132 2 40H0V0Z"
        fill="currentColor"
      />
    </svg>
  );
}
