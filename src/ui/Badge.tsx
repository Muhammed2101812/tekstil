import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary' | 'accent';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { c, radius, type } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: c.surfaceSubtle, fg: c.textSecondary },
    success: { bg: c.successSoft, fg: c.success },
    danger: { bg: c.dangerSoft, fg: c.danger },
    warning: { bg: c.warningSoft, fg: c.warning },
    primary: { bg: c.primarySoft, fg: c.primary },
    accent: { bg: c.accentSoft, fg: c.accent },
  };
  const t = map[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg, borderRadius: radius.pill }]}>
      <Text style={[type.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 10, paddingVertical: 4 },
});
