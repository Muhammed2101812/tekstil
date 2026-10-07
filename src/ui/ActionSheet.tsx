import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight, hapticWarning } from '../utils/haptics';

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionItem[];
}) {
  const { c, spacing, type } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 4, paddingBottom: spacing.md }}>
        {actions.map((a, i) => (
          <Pressable
            key={`${a.label}-${i}`}
            disabled={a.disabled}
            onPress={() => {
              if (a.destructive) hapticWarning();
              else hapticLight();
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: pressed ? c.surfaceSubtle : 'transparent', opacity: a.disabled ? 0.4 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            {a.icon}
            <Text style={[type.body, { color: a.destructive ? c.danger : c.text, marginLeft: a.icon ? 12 : 0 }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

/** Büyük işlemler için açık onay ekranı (PLAN 2.5) — children ile ek alanlar gösterilebilir */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel = 'Onayla',
  destructive = false,
  holdToConfirm = false,
  onConfirm,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  holdToConfirm?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const { c, spacing, type } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { color: c.text }]}>{title}</Text>
      <Text style={[type.body, { color: c.textSecondary, marginTop: spacing.sm }]}>{message}</Text>
      {children ? <View style={{ marginTop: spacing.lg }}>{children}</View> : null}
      <View style={{ gap: 10, marginTop: spacing.xl, marginBottom: spacing.md }}>
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          holdToConfirm={holdToConfirm}
          onPress={() => {
            onClose();
            onConfirm();
          }}
        />
        <Button label="Vazgeç" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 54, borderRadius: 12 },
});
