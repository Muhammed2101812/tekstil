import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c, radius, type } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceSubtle, borderRadius: radius.md }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              hapticLight();
              onChange(o.value);
            }}
            style={[styles.seg, { borderRadius: radius.sm }, active && { backgroundColor: c.surface }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[type.small, { color: active ? c.text : c.textMuted, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, gap: 4 },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
