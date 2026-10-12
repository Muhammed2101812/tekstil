import React from 'react';
import { Image } from 'expo-image';

interface AtelierLogoProps {
  size?: number;
}

/**
 * Atölye Logo — Seçilen düz (flat) kurumsal marka logosu
 */
export function AtelierLogo({ size = 32 }: AtelierLogoProps) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
      contentFit="contain"
    />
  );
}
