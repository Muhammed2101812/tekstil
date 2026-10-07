import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight, hapticSuccess } from '../utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  /** Yanlışlıkla dokunmayı önleyen basılı-tutarak onay (PLAN 6.7) */
  holdToConfirm?: boolean;
  holdDurationMs?: number;
  size?: ButtonSize;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  holdToConfirm = false,
  holdDurationMs = 900,
  size = 'lg',
  full = true,
  style,
}: ButtonProps) {
  const { c, type } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const colors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary },
    danger: { bg: c.danger, fg: '#FFFFFF' },
    accent: { bg: c.accent, fg: c.onAccent },
  };
  const col = colors[variant];

  const startHold = () => {
    if (!holdToConfirm || disabled || loading) return;
    setHolding(true);
    Animated.timing(progress, { toValue: 1, duration: holdDurationMs, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      hapticSuccess();
      setHolding(false);
      progress.setValue(0);
      onPress();
    }, holdDurationMs);
  };

  const cancelHold = () => {
    if (!holdToConfirm) return;
    if (timer.current) clearTimeout(timer.current);
    setHolding(false);
    progress.stopAnimation();
    progress.setValue(0);
  };

  const sizeMetrics = {
    sm: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: 10,
      gap: 6,
      fontSize: 13,
      fontWeight: '600' as const,
    },
    md: {
      height: 44,
      paddingHorizontal: 18,
      borderRadius: 12,
      gap: 8,
      fontSize: 14,
      fontWeight: '600' as const,
    },
    lg: {
      height: 52,
      paddingHorizontal: 22,
      borderRadius: 14,
      gap: 8,
      fontSize: 16,
      fontWeight: '700' as const,
    },
  }[size];

  const bgDisabled = c.surfaceSubtle;

  return (
    <View style={[full && { width: '100%' }, style]}>
      <Pressable
        onPress={() => {
          if (holdToConfirm || disabled || loading) return;
          hapticLight();
          onPress();
        }}
        onPressIn={startHold}
        onPressOut={cancelHold}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={holdToConfirm ? `${label} (basılı tut)` : label}
        style={({ pressed }) => [
          styles.base,
          {
            height: sizeMetrics.height,
            paddingHorizontal: sizeMetrics.paddingHorizontal,
            borderRadius: sizeMetrics.borderRadius,
            gap: sizeMetrics.gap,
            backgroundColor: disabled ? bgDisabled : col.bg,
            borderWidth: col.border ? 1 : 0,
            borderColor: col.border,
            opacity: pressed && !holdToConfirm ? 0.88 : 1,
            transform: [{ scale: pressed && !holdToConfirm ? 0.985 : 1 }],
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={disabled ? c.textMuted : col.fg} size="small" />
        ) : (
          <>
            {icon}
            {label ? (
              <Text
                style={[
                  size === 'lg' ? type.body : size === 'md' ? type.small : type.label,
                  {
                    color: disabled ? c.textMuted : col.fg,
                    fontWeight: sizeMetrics.fontWeight,
                    fontSize: sizeMetrics.fontSize,
                  },
                ]}
                numberOfLines={1}
              >
                {holdToConfirm && !holding ? `${label} (basılı tut)` : label}
              </Text>
            ) : null}
          </>
        )}
        {holdToConfirm && (
          <Animated.View
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              borderRadius: sizeMetrics.borderRadius,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: 'rgba(255,255,255,0.25)',
              overflow: 'hidden',
            }}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
