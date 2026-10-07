import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Ekranın alt yarısındaki büyük eylem alanı (status pill vb.) */
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  badge?: string;
  badgeTone?: 'danger' | 'warning' | 'success' | 'neutral';
  onPress?: () => void;
  href?: string;
}

export function ListRow({ title, subtitle, trailing, leading, badge, badgeTone = 'neutral', onPress, href }: ListRowProps) {
  const { c, spacing, type } = useTheme();
  const handle = () => {
    hapticLight();
    if (href) router.push(href as never);
    else onPress?.();
  };
  return (
    <Pressable
      onPress={handle}
      style={({ pressed }) => StyleSheet.flatten([styles.row, { paddingHorizontal: spacing.lg, opacity: pressed ? 0.85 : 1 }])}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {leading ?? <Avatar name={title} size={42} />}
      <View style={styles.mid}>
        <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.small, { color: c.textMuted, marginTop: 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? <Badge label={badge} tone={badgeTone} /> : null}
      {trailing ?? <ChevronRight size={20} color={c.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
  },
  mid: { flex: 1 },
});
