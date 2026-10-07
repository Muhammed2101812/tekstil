import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';
import { formatMoney } from '../utils/format';

/**
 * Özel sayı tuş takımı (PLAN 2.3): tutar girişi klavye açtırmadan,
 * büyük tuşlarla ve canlı ₺ biçimiyle yapılır.
 */
export function NumberPadSheet({
  visible,
  onClose,
  title,
  initial = '0',
  unit = '₺',
  quickAmounts,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  initial?: string;
  unit?: '₺' | 'sa' | 'dk' | 'gün';
  quickAmounts?: number[];
  onDone: (value: number) => void;
}) {
  const { c, radius, spacing, type } = useTheme();
  const [raw, setRaw] = useState(initial);

  const display = useMemo(() => {
    // raw: '0' | '12500' | '12500,5' | '12500,50'
    const [intPart, decPart] = raw.split(',');
    const int = Number(intPart || '0').toLocaleString('tr-TR');
    return unit === '₺' ? `₺${int}${decPart !== undefined ? `,${decPart}` : ''}` : `${int}${decPart !== undefined ? `,${decPart}` : ''} ${unit}`;
  }, [raw, unit]);

  const press = (key: string) => {
    hapticLight();
    setRaw((prev) => {
      const [intPart, decPart] = prev.split(',');
      if (key === 'del') {
        if (decPart !== undefined) {
          if (decPart.length > 0) return `${intPart},${decPart.slice(0, -1)}`;
          return intPart;
        }
        return intPart.length > 1 ? intPart.slice(0, -1) : '0';
      }
      if (key === ',') {
        if (decPart !== undefined) return prev;
        return `${intPart},`;
      }
      // rakam
      if (decPart !== undefined) {
        if (decPart.length >= 2) return prev;
        return `${intPart},${decPart}${key}`;
      }
      const next = intPart === '0' ? key : intPart + key;
      if (unit === '₺' && next.length > 9) return prev;
      if (unit !== '₺' && next.length > 5) return prev;
      return next;
    });
  };

  const numericValue = useMemo(() => Number(raw.replace(',', '.')) || 0, [raw]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <Text style={[type.money, { color: c.text, textAlign: 'center', marginVertical: spacing.lg }]}>{display}</Text>

      {quickAmounts && quickAmounts.length > 0 ? (
        <View style={[styles.quick, { marginBottom: spacing.md }]}>
          {quickAmounts.map((q) => (
            <Pressable
              key={q}
              onPress={() => {
                hapticLight();
                setRaw(String(q).replace('.', ','));
              }}
              style={[styles.quickBtn, { backgroundColor: c.surfaceSubtle, borderRadius: radius.pill }]}
            >
              <Text style={[type.small, { color: c.textSecondary, fontWeight: '700' }]}>{unit === '₺' ? formatMoney(q) : `${q} ${unit}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? c.surfaceSubtle : c.surface, borderRadius: radius.md },
            ]}
            accessibilityLabel={k === ',' ? 'virgül' : k}
          >
            <Text style={[type.subtitle, { color: c.text }]}>{k}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => press('del')}
          onLongPress={() => {
            hapticLight();
            setRaw('0');
          }}
          style={({ pressed }) => [
            styles.key,
            { backgroundColor: pressed ? c.border : c.surfaceSubtle, borderRadius: radius.md },
          ]}
          accessibilityLabel="sil (basılı tutunca tümünü temizler)"
        >
          <Delete size={26} color={c.danger} />
        </Pressable>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Button
          label="Tamam"
          onPress={() => {
            onDone(numericValue);
            onClose();
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: { width: '30%', aspectRatio: 1.45, alignItems: 'center', justifyContent: 'center' },
});
