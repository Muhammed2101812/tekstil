import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';
import { NumberPadSheet } from './NumberPad';
import { formatMoney } from '../utils/format';

/** Para girişi: dokununca özel sayı tuş takımı açılır (PLAN 2.3) */
export function MoneyField({
  label,
  value,
  onChange,
  quickAmounts,
  error,
  hint,
  placeholder = '₺0',
  unit = '₺',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  quickAmounts?: number[];
  error?: string | null;
  hint?: string | null;
  placeholder?: string;
  unit?: '₺' | 'sa' | 'dk' | 'gün';
}) {
  const { c, radius, spacing, type } = useTheme();
  const [open, setOpen] = useState(false);
  const display = value > 0 ? (unit === '₺' ? formatMoney(value, { kurus: true }) : `${value} ${unit}`) : placeholder;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[type.small, { color: c.textSecondary, marginBottom: 6, fontWeight: '600' }]}>{label}</Text>
      <Pressable
        onPress={() => {
          hapticLight();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.box,
          { borderRadius: radius.md, borderColor: error ? c.danger : c.border, backgroundColor: c.surface },
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
      >
        <Text style={[type.subtitle, { color: value > 0 ? c.text : c.textMuted }]}>{display}</Text>
      </Pressable>
      {error ? <Text style={[type.small, { color: c.danger, marginTop: 6 }]}>{error}</Text> : null}
      {hint ? <Text style={[type.small, { color: c.textMuted, marginTop: 6 }]}>{hint}</Text> : null}

      {/* key: sheet her açılışta güncel değerle yeniden doğar (Vazgeç sonrası bayat değer kalmasın) */}
      <NumberPadSheet
        key={`pad-${open}-${value}`}
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        initial={value > 0 ? String(value).replace('.', ',') : '0'}
        unit={unit}
        quickAmounts={quickAmounts}
        onDone={(v) => onChange(v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 54, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1 },
});
