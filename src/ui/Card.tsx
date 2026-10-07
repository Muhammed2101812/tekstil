import React from 'react';
import { Pressable, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  padded = true,
  style,
  contentStyle,
}: CardProps) {
  const { c, radius, spacing } = useTheme();

  const containerStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: c.surface,
      borderRadius: radius.card,
      borderColor: c.border,
    },
    style,
  ];

  const content = (
    <View style={[{ padding: padded ? spacing.lg : 0 }, contentStyle]}>
      {children}
    </View>
  );

  if (!onPress) {
    return <View style={containerStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [
        containerStyle,
        pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
      ]}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
  style,
}: {
  title: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, spacing, type } = useTheme();
  return (
    <View style={[styles.section, { marginTop: spacing.xl, marginBottom: spacing.sm }, style]}>
      <Text style={[type.label, { color: c.textMuted, letterSpacing: 0.8 }]}>
        {title.toLocaleUpperCase('tr-TR')}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
});
