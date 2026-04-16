import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, Spacing, FontSize } from '@/constants/theme';

export type PlayerPhase = 'idle' | 'loading' | 'synthesizing' | 'error';

interface Props {
  phase: PlayerPhase;
  voiceName: string;
  speed: number;
  disabled?: boolean;
  onPlay: () => void;
  onStop: () => void;
  statusText?: string;
}

export function PlayerBar({ phase, voiceName, speed, disabled, onPlay, onStop, statusText }: Props) {
  const busy = phase === 'loading' || phase === 'synthesizing';

  return (
    <View style={s.bar}>
      {busy ? (
        <View style={[s.playBtn, { opacity: 0.7 }]}>
          <ActivityIndicator color={C.white} size="small" />
        </View>
      ) : (
        <TouchableOpacity
          style={[s.playBtn, (disabled || phase === 'error') && { opacity: 0.3 }]}
          onPress={onPlay}
          disabled={disabled || busy}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={22} color={C.white} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.stopBtn} onPress={onStop} activeOpacity={0.7}>
        <Ionicons name="stop" size={16} color={C.textSub} />
      </TouchableOpacity>

      <View style={s.info}>
        {statusText && phase !== 'idle' ? (
          <Text style={[s.status, phase === 'error' && { color: C.error }]} numberOfLines={1}>
            {statusText}
          </Text>
        ) : (
          <View style={s.voiceRow}>
            <Ionicons name="mic" size={14} color={C.primary} />
            <Text style={s.voiceText}>{voiceName}</Text>
            <Text style={s.speedText}>{speed}×</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  status: { fontSize: FontSize.small, fontWeight: '500', color: C.primary },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceText: { fontSize: FontSize.small, fontWeight: '600', color: C.text },
  speedText: { fontSize: FontSize.caption, fontWeight: '600', color: C.textSub },
});
