import React, { useEffect, useRef, useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Keyboard,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { loadSettings, saveRecent, type AppSettings } from "@/lib/settings";
import { consumePending } from "@/lib/pending";
import { stop } from "@/lib/tts";
import { PlayerBar } from "@/components/PlayerBar";
import { useSentencePlayer } from "@/hooks/useSentencePlayer";

function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

export default function Reader() {
  const [text, setText] = useState(() => consumePending());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const player = useSentencePlayer({
    voice: settings?.voice ?? "Bella",
    speed: settings?.speed ?? 1.2,
  });

  // Stop playback when navigating away
  useFocusEffect(
    useCallback(() => {
      return () => { player.stop(); };
    }, [player.stop]),
  );

  const savedRef = useRef("");
  const playing = player.phase === "playing";
  const busy = player.phase === "loading" || playing;

  const handlePlay = useCallback(() => {
    if (!text.trim() || !settings) return;
    Keyboard.dismiss();
    const trimmed = text.trim();
    if (savedRef.current !== trimmed) {
      savedRef.current = trimmed;
      saveRecent({
        type: "text",
        title: trimmed.slice(0, 40).replace(/\n/g, " "),
        preview: trimmed.slice(0, 120).replace(/\n/g, " "),
        fullText: trimmed,
        words: wordCount(trimmed),
      });
    }
    player.play(trimmed);
  }, [text, settings, player.play]);

  const handlePaste = useCallback(async () => {
    try {
      const c = await Clipboard.getStringAsync();
      if (c) setText((p) => p + c);
    } catch {}
  }, []);

  const handleClear = useCallback(() => {
    player.stop();
    setText("");
  }, [player.stop]);

  const statusText =
    player.phase === "loading"
      ? "Loading engine…"
      : playing
        ? `Sentence ${player.activeIndex + 1} of ${player.sentences.length}`
        : player.phase === "error"
          ? player.error
          : undefined;

  const words = wordCount(text);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Text"
          onBack={stop}
          right={
            <TouchableOpacity onPress={handlePaste} hitSlop={8}>
              <Ionicons name="clipboard-outline" size={20} color={C.textSub} />
            </TouchableOpacity>
          }
        />

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {playing ? (
            <View style={s.sentenceView}>
              {player.sentences.map((sentence, i) => (
                <Text
                  key={i}
                  style={[
                    s.sentence,
                    i === player.activeIndex && s.sentenceActive,
                    i < player.activeIndex && s.sentenceDone,
                  ]}
                >
                  {sentence}{" "}
                </Text>
              ))}
            </View>
          ) : (
            <>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Type or paste your text here…"
                placeholderTextColor={C.textMuted}
                editable={!busy}
                textAlignVertical="top"
                selectionColor={C.primary}
              />
              <View style={s.meta}>
                {words > 0 && (
                  <Text style={s.wordCount}>
                    {words} word{words !== 1 ? "s" : ""}
                  </Text>
                )}
                <View style={{ flex: 1 }} />
                {text.length > 0 && (
                  <TouchableOpacity onPress={handleClear}>
                    <Text style={s.clearText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </ScrollView>

        <PlayerBar
          phase={
            playing
              ? "synthesizing"
              : player.phase === "loading"
                ? "loading"
                : player.phase === "error"
                  ? "error"
                  : "idle"
          }
          voiceName={settings?.voice ?? "Bella"}
          speed={settings?.speed ?? 1.2}
          disabled={!text.trim()}
          onPlay={handlePlay}
          onStop={player.stop}
          statusText={statusText}
        />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: Spacing.lg },
  input: {
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    fontSize: FontSize.body,
    color: C.text,
    minHeight: 220,
    lineHeight: 24,
  },
  meta: { flexDirection: "row", alignItems: "center", marginTop: Spacing.sm },
  wordCount: { fontSize: FontSize.caption, color: C.textMuted },
  clearText: { fontSize: FontSize.small, color: C.primary, fontWeight: "500" },

  sentenceView: {
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    minHeight: 220,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  sentence: {
    fontSize: FontSize.body,
    lineHeight: 26,
    color: C.textMuted,
  },
  sentenceActive: {
    color: C.text,
    backgroundColor: C.primaryDim,
    borderRadius: 4,
    overflow: "hidden",
  },
  sentenceDone: {
    color: C.textSub,
  },
});
