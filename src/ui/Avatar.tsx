import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { initials, avatarColor } from '../utils/format';

export function Avatar({ name, photoUrl, size = 42 }: { name: string; photoUrl?: string | null; size?: number }) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor(name) + '22',
          borderColor: avatarColor(name) + '55',
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: avatarColor(name) }}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
