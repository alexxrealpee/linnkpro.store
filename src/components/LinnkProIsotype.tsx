import React from 'react';

interface LinnkProIsotypeProps {
  className?: string;
  size?: number | string;
  roundedClassName?: string;
  showShadow?: boolean;
}

export default function LinnkProIsotype({
  className = '',
  size = 32,
  roundedClassName = 'rounded-xl',
  showShadow = true
}: LinnkProIsotypeProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none bg-gradient-to-br from-[#FF3B56] via-[#EE2B47] to-[#D91636] ${roundedClassName} ${showShadow ? 'shadow-md shadow-red-500/25' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 512 512"
        className="w-[72%] h-[72%] text-white"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Chef Hat Contour */}
        <path
          d="
            M 176 320
            C 134 300 128 230 162 195
            C 192 165 218 178 226 190
            C 236 142 276 130 300 136
            C 328 144 344 176 348 190
            C 358 178 384 165 414 195
            C 448 230 442 300 400 320
            V 392
            C 400 404 390 414 378 414
            H 198
            C 186 414 176 404 176 392
            Z
          "
          stroke="#FFFFFF"
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(-38, -6) scale(1.15, 1.15)"
        />
        {/* Lower Brim Divider Band */}
        <line
          x1="164"
          y1="352"
          x2="348"
          y2="352"
          stroke="#FFFFFF"
          strokeWidth="34"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
