import { type SVGProps } from 'react';

export function PalaceWatermark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M50 5C45 15 40 20 30 20C25 20 20 25 20 30C20 35 15 40 5 40L5 60H95L95 40C85 40 80 35 80 30C80 25 75 20 70 20C60 20 55 15 50 5Z"
        fill="currentColor"
        opacity="0.2"
      />
      <circle cx="50" cy="5" r="5" fill="currentColor" opacity="0.2" />
      <circle cx="30" cy="15" r="3" fill="currentColor" opacity="0.2" />
      <circle cx="70" cy="15" r="3" fill="currentColor" opacity="0.2" />
    </svg>
  );
}
