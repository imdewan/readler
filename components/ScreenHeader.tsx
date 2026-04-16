import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, Spacing, FontSize } from '@/constants/theme';

interface Props {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export function ScreenHeader({ title, right, onBack }: Props) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => { onBack?.(); router.back(); }} hitSlop={12} style={s.back}>
        <Ionicons name="chevron-back" size={24} color={C.text} />
      </TouchableOpacity>
      <Text style={s.title}>{title}</Text>
      <View style={s.rightSlot}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSize.title, fontWeight: '600', color: C.text },
  rightSlot: { width: 36, alignItems: 'center', justifyContent: 'center' },
});
