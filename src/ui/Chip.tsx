import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

export function Chip({
  label,
  selected,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'accent';
}) {
  const { c, radius, type } = useTheme();
  const activeBg = tone === 'accent' ? c.accent : c.primary;
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress?.();
      }}
      style={[
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? activeBg : c.surface,
          borderColor: selected ? activeBg : c.border,
        },
      ]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      <Text style={[type.small, { color: selected ? c.onPrimary : c.textSecondary, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  tone = 'neutral',
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <View style={styles.group}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} tone={tone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1 },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
