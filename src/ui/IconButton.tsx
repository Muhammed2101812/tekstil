import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

export type IconButtonTone = 'neutral' | 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg' | number;

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'neutral',
  size = 'md',
  style,
  disabled = false,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  label: string;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { c, dark } = useTheme();

  const dimension =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 36
      : size === 'lg'
      ? 48
      : 40;

  const bgMap: Record<IconButtonTone, { bg: string; border?: string }> = {
    neutral: { bg: dark ? c.surfaceContainer : c.surfaceContainerLow },
    secondary: { bg: c.surface, border: c.border },
    primary: { bg: c.primarySoft },
    accent: { bg: c.accentSoft },
    ghost: { bg: 'transparent' },
    danger: { bg: c.dangerSoft },
  };

  const currentTone = bgMap[tone];

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hapticLight();
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: currentTone.bg,
          borderWidth: currentTone.border ? 1 : 0,
          borderColor: currentTone.border,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !disabled ? 0.95 : 1 }],
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
