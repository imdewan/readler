import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  type Gender,
  type AppSettings,
  FEMALE_VOICES,
  MALE_VOICES,
  SPEED_OPTIONS,
  VOICE_DESCRIPTIONS,
  loadSettings,
  saveSettings,
  clearAllData,
} from "@/lib/settings";

const SW = Dimensions.get("window").width;

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={C.textSub} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const reload = useCallback(() => {
    loadSettings().then(setSettings);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function update(patch: Partial<AppSettings>) {
    await saveSettings(patch);
    reload();
  }

  function setGender(g: Gender) {
    update({
      gender: g,
      voice: g === "female" ? FEMALE_VOICES[0] : MALE_VOICES[0],
    });
  }

  function resetOnboarding() {
    Alert.alert(
      "Reset Setup",
      "This will take you back to the initial setup screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await saveSettings({ onboardingDone: false });
            router.replace("/");
          },
        },
      ],
    );
  }

  function handleClearData() {
    Alert.alert(
      "Clear All Data",
      "This will erase all settings, recent history, and take you back to setup.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Everything",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            router.replace("/");
          },
        },
      ],
    );
  }

  if (!settings) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const voices = settings.gender === "female" ? FEMALE_VOICES : MALE_VOICES;
  const accent = settings.gender === "female" ? C.female : C.male;
  const accentDim = settings.gender === "female" ? C.femaleDim : C.maleDim;

  return (
    <SafeAreaView style={s.safe}>
      <ScreenHeader title="Settings" />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <Section icon="person-outline" title="Name">
          <TextInput
            style={s.nameInput}
            value={settings.userName}
            onChangeText={(v) => update({ userName: v })}
            placeholder="Your name"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
            maxLength={30}
            selectionColor={C.primary}
          />
        </Section>

        {/* Voice type */}
        <Section icon="people-outline" title="Voice type">
          <View style={s.genderRow}>
            {(["female", "male"] as Gender[]).map((g) => {
              const active = settings.gender === g;
              const color = g === "female" ? C.female : C.male;
              const dim = g === "female" ? C.femaleDim : C.maleDim;
              return (
                <TouchableOpacity
                  key={g}
                  style={[
                    s.genderBtn,
                    active && { backgroundColor: dim, borderColor: color },
                  ]}
                  onPress={() => setGender(g)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={g === "female" ? "woman" : "man"}
                    size={20}
                    color={active ? color : C.textSub}
                  />
                  <Text style={[s.genderText, active && { color }]}>
                    {g === "female" ? "Female" : "Male"}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={16} color={color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Voice */}
        <Section icon="mic-outline" title="Voice">
          <View style={s.voiceGrid}>
            {voices.map((v) => {
              const active = settings.voice === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[
                    s.voiceCard,
                    active && {
                      borderColor: accent,
                      backgroundColor: accentDim,
                    },
                  ]}
                  onPress={() => update({ voice: v })}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      s.voiceAvatar,
                      { backgroundColor: active ? accent : C.cardHigh },
                    ]}
                  >
                    <Text style={s.voiceInitial}>{v[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.voiceName, active && { color: accent }]}>
                      {v}
                    </Text>
                    <Text style={s.voiceDesc}>{VOICE_DESCRIPTIONS[v]}</Text>
                  </View>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={accent}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Speed */}
        <Section icon="speedometer-outline" title="Reading speed">
          <View style={s.speedGrid}>
            {SPEED_OPTIONS.map((opt) => {
              const active = settings.speed === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.speedChip, active && s.speedChipActive]}
                  onPress={() => update({ speed: opt.value })}
                  activeOpacity={0.7}
                >
                  <Text style={[s.speedText, active && s.speedTextActive]}>
                    {opt.label}
                  </Text>
                  {opt.recommended && (
                    <Ionicons name="star" size={10} color={C.warning} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Current */}
        <View style={s.currentBox}>
          <Ionicons name="mic" size={16} color={C.primary} />
          <Text style={s.currentText}>
            {settings.voice} · {settings.speed}×
          </Text>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.actionRow}
            onPress={resetOnboarding}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color={C.error} />
            <Text style={s.actionTextDanger}>Reset onboarding</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionRow, { marginTop: 8 }]}
            onPress={handleClearData}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={C.error} />
            <Text style={s.actionTextDanger}>Clear all data</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.info}>Readler · nano v0.8 · 24 kHz · Offline</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: C.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  nameInput: {
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.body,
    fontWeight: "500",
    color: C.text,
  },

  genderRow: { flexDirection: "row", gap: 10 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  genderText: {
    fontSize: FontSize.body,
    fontWeight: "500",
    color: C.text,
    flex: 1,
  },

  voiceGrid: { gap: 8 },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  voiceAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceInitial: { fontSize: 16, fontWeight: "700", color: C.text },
  voiceName: { fontSize: FontSize.body, fontWeight: "600", color: C.text },
  voiceDesc: { fontSize: FontSize.caption, color: C.textSub, marginTop: 1 },

  speedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  speedChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  speedChipActive: { backgroundColor: C.primaryDim },
  speedText: { fontSize: FontSize.small, fontWeight: "600", color: C.textSub },
  speedTextActive: { color: C.primary },

  currentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  currentText: { fontSize: FontSize.body, fontWeight: "600", color: C.text },

  actions: { marginBottom: Spacing.xl },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
  },
  actionTextDanger: {
    fontSize: FontSize.body,
    color: C.error,
    fontWeight: "500",
  },

  info: { textAlign: "center", fontSize: FontSize.caption, color: C.textMuted },
});
