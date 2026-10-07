import React from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'success' | 'danger' | 'primary' | 'warning';
  onPress?: () => void;
  href?: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  onPress,
  href,
  icon,
  style,
}: StatCardProps) {
  const { c, radius, spacing, type } = useTheme();
  const [scale] = React.useState(() => new Animated.Value(1));

  const toneColor =
    tone === 'success'
      ? c.success
      : tone === 'danger'
      ? c.danger
      : tone === 'primary'
      ? c.primary
      : tone === 'warning'
      ? c.warning
      : c.text;

  const handle = () => {
    hapticLight();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 90,
        useNativeDriver: Platform.OS !== 'web',
        easing: Easing.out(Easing.quad),
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
        easing: Easing.out(Easing.quad),
      }),
    ]).start();
    if (href) router.push(href as never);
    else onPress?.();
  };

  return (
    <Pressable
      onPress={handle}
      style={[{ flex: 1, minWidth: '45%' }, style]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            borderRadius: radius.card,
            borderColor: c.border,
            padding: spacing.lg,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={styles.top}>
          <Text style={[type.label, { color: c.textMuted }]} numberOfLines={1}>
            {label}
          </Text>
          {icon}
        </View>
        <Text
          style={[type.money, { color: toneColor, marginTop: 6 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {sub ? (
          <Text style={[type.small, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export function StatGrid({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
    minHeight: 90,
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
