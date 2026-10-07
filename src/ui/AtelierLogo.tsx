import React from 'react';
import Svg, { Rect, Path, Ellipse } from 'react-native-svg';

interface AtelierLogoProps {
  size?: number;
}

/**
 * Atölye Logo — "Makara + Onay" motifli düz (flat) marka logosu
 */
export function AtelierLogo({ size = 32 }: AtelierLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Rect width="1024" height="1024" rx="224" fill="#3B5BDB" />
      <Path
        d="M 300 280 C 420 255 604 255 724 280 C 738 283 748 296 744 310 C 736 338 710 356 660 360 L 364 360 C 314 356 288 338 280 310 C 276 296 286 283 300 280 Z"
        fill="#FFFFFF"
      />
      <Ellipse cx="512" cy="296" rx="36" ry="14" fill="#3B5BDB" />
      <Rect x="360" y="350" width="304" height="324" fill="#FFFFFF" />
      <Rect x="336" y="372" width="352" height="280" rx="20" fill="#FF7A59" />
      <Path
        d="M 364 664 L 660 664 C 710 668 736 686 744 714 C 748 728 738 741 724 744 C 604 769 420 769 300 744 C 286 741 276 728 280 714 C 288 686 314 668 364 664 Z"
        fill="#FFFFFF"
      />
      <Path
        d="M 420 508 L 488 576 L 616 436"
        stroke="#FFFFFF"
        strokeWidth="64"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
