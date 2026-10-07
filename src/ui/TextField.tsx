import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string | null;
  secure?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  multiline?: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secure = false,
  keyboardType = 'default',
  multiline = false,
  right,
  onPress,
  autoCapitalize = 'sentences',
}: TextFieldProps) {
  const { c, radius, spacing, type } = useTheme();
  const [hide, setHide] = useState(true);

  const field = (
    <View
      style={[
        styles.box,
        {
          borderRadius: radius.md,
          borderColor: error ? c.danger : c.border,
          backgroundColor: c.surface,
          paddingHorizontal: spacing.lg,
          minHeight: 52,
        },
        multiline && { minHeight: 96, alignItems: 'flex-start', paddingVertical: spacing.md },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        secureTextEntry={secure && hide}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        editable={!onPress}
        autoCapitalize={autoCapitalize}
        style={[type.body, { color: c.text, flex: 1, paddingVertical: multiline ? 0 : 12, pointerEvents: onPress ? 'none' : 'auto' }]}
        accessibilityLabel={label}
      />
      {secure ? (
        <Pressable onPress={() => setHide(!hide)} hitSlop={8} accessibilityLabel={hide ? 'Şifreyi göster' : 'Şifreyi gizle'}>
          {hide ? <EyeOff size={20} color={c.textMuted} /> : <Eye size={20} color={c.textMuted} />}
        </Pressable>
      ) : right}
    </View>
  );

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? (
        <Text style={[type.small, { color: c.textSecondary, marginBottom: 6, fontWeight: '600' }]}>{label}</Text>
      ) : null}
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button">
          {field}
        </Pressable>
      ) : (
        field
      )}
      {error ? (
        <Text style={[type.small, { color: c.danger, marginTop: 6 }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.small, { color: c.textMuted, marginTop: 6 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1 },
});
