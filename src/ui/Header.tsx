import React from 'react';
import { StyleSheet, Text, View, Pressable, StyleProp, ViewStyle, Platform, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Küçük ekran başlığı (detay sayfaları) */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Header({
  title,
  subtitle,
  back = false,
  onBack,
  right,
  compact = false,
  style,
}: HeaderProps) {
  const { c, type, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    hapticLight();
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(
    insets.top,
    statusBarHeight,
    Platform.OS === 'ios' ? 44 : 28
  );

  return (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: spacing.xl,
          paddingTop: topInset + (compact ? spacing.sm : spacing.md),
          paddingBottom: spacing.md,
        },
        style,
      ]}
    >
      <View style={styles.left}>
        {back && (
          <Pressable
            hitSlop={14}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: pressed ? c.surfaceSubtle : 'transparent',
              },
            ]}
            accessibilityLabel="Geri"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={c.text} strokeWidth={2.4} />
          </Pressable>
        )}
        <View style={styles.titleCol}>
          <Text
            style={[
              compact ? type.subtitle : type.title,
              { color: c.text, fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[type.small, { color: c.textMuted, marginTop: 2 }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  titleCol: {
    flex: 1,
    justifyContent: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
