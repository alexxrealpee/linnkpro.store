import React from 'react';
import LinnkProIsotype from './LinnkProIsotype';

interface LinnkProLogoProps {
  className?: string;
  iconSize?: number;
  textSize?: string;
  onClick?: () => void;
  roundedClassName?: string;
}

export default function LinnkProLogo({
  className = '',
  iconSize = 36,
  textSize = 'text-base sm:text-xl md:text-2xl',
  onClick,
  roundedClassName = 'rounded-xl sm:rounded-2xl'
}: LinnkProLogoProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 sm:gap-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <LinnkProIsotype
        size={iconSize}
        roundedClassName={roundedClassName}
      />
      <span className={`font-extrabold tracking-tight text-white lowercase ${textSize}`}>
        linnkpro<span className="text-[#F4B400]">.store</span>
      </span>
    </div>
  );
}
