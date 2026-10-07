import React from 'react';
import { RefreshControlProps, ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** İçerik alt sabit butona yer açar */
  bottomInset?: number;
  keyboard?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export function Screen({ children, scroll = true, padded = true, bottomInset = 0, keyboard = false, refreshControl }: ScreenProps) {
  const { c, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const style = {
    backgroundColor: c.background,
    flexGrow: scroll ? 1 : undefined,
    paddingHorizontal: padded ? spacing.xl : 0,
    paddingBottom: insets.bottom + bottomInset + (padded ? spacing.xl : 0),
  };

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={style}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, style]}>{children}</View>
  );

  if (keyboard) {
    return (
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[styles.fill, { backgroundColor: c.background }]}>{content}</View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
