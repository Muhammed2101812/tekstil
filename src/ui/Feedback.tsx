import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
}) {
  const { c } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width: width as never,
        height,
        borderRadius: radius,
        backgroundColor: c.skeleton,
        opacity: pulse,
      }}
    />
  );
}

export function EmptyState({
  emoji,
  icon,
  title,
  subtitle,
  action,
}: {
  emoji?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { c, spacing, type } = useTheme();
  return (
    <View style={styles.center}>
      {icon ? (
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: c.primarySoft,
              marginBottom: spacing.md,
            },
          ]}
        >
          {icon}
        </View>
      ) : emoji ? (
        <Text style={{ fontSize: 44, marginBottom: spacing.md }}>{emoji}</Text>
      ) : null}
      <Text style={[type.subtitle, { color: c.text, textAlign: 'center' }]}>{title}</Text>
      {subtitle ? (
        <Text
          style={[
            type.small,
            { color: c.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 300 },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: spacing.xl, alignSelf: 'stretch', alignItems: 'center' }}>
          {action}
        </View>
      ) : null}
    </View>
  );
}

export function ProgressBar({
  progress,
  tone = 'primary',
}: {
  progress: number;
  tone?: 'primary' | 'success';
}) {
  const { c, radius } = useTheme();
  const pct = Math.min(1, Math.max(0, progress));
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceSubtle, borderRadius: radius.pill }]}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          backgroundColor: tone === 'success' ? c.success : c.primary,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 8, width: '100%', overflow: 'hidden' },
});
