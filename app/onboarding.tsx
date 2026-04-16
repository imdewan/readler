import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import {
  type Gender,
  FEMALE_VOICES,
  MALE_VOICES,
  SPEED_OPTIONS,
  VOICE_DESCRIPTIONS,
  saveSettings,
} from "@/lib/settings";
import { loadModel, isLoaded } from "@/lib/tts";

const { width: SW } = Dimensions.get("window");

// ── Step 0: Hey ───────────────────────────────────────────────────────────────

function HeyStep({ onContinue }: { onContinue: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(hintOpacity, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <TouchableOpacity style={s.heyWrap} onPress={onContinue} activeOpacity={1}>
      <Animated.Text style={[s.heyText, { opacity }]}>Hey! 👋</Animated.Text>
      <Animated.Text style={[s.heyHint, { opacity: hintOpacity }]}>
        Tap to continue
      </Animated.Text>
    </TouchableOpacity>
  );
}

// ── Step 1: Name ──────────────────────────────────────────────────────────────

function NameStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.stepBody}>
      <Text style={s.stepTitle}>What&apos;s your name?</Text>
      <Text style={s.stepSub}>We&apos;ll personalise your experience</Text>
      <TextInput
        style={s.nameInput}
        value={value}
        onChangeText={onChange}
        placeholder="First name"
        placeholderTextColor={C.textMuted}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        maxLength={30}
        selectionColor={C.primary}
      />
    </View>
  );
}

// ── Step 2: Gender ────────────────────────────────────────────────────────────

function GenderStep({
  userName,
  selected,
  onSelect,
}: {
  userName: string;
  selected: Gender;
  onSelect: (g: Gender) => void;
}) {
  return (
    <View style={s.stepBody}>
      <Text style={s.stepTitle}>
        {userName
          ? `Hi ${userName}! Choose a voice type`
          : "Choose a voice type"}
      </Text>
      <Text style={s.stepSub}>
        This filters which voices you&apos;ll see next
      </Text>
      <View style={s.genderRow}>
        {(["female", "male"] as Gender[]).map((g) => {
          const active = selected === g;
          const color = g === "female" ? C.female : C.male;
          const dim = g === "female" ? C.femaleDim : C.maleDim;
          const voices = g === "female" ? FEMALE_VOICES : MALE_VOICES;
          const icon = g === "female" ? "woman" : "man";
          return (
            <TouchableOpacity
              key={g}
              style={[
                s.genderCard,
                active && { borderColor: color, backgroundColor: dim },
              ]}
              onPress={() => onSelect(g)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={icon as any}
                size={36}
                color={active ? color : C.textSub}
              />
              <Text style={[s.genderLabel, active && { color }]}>
                {g === "female" ? "Female" : "Male"}
              </Text>
              <Text style={s.genderVoiceList}>{voices.join(", ")}</Text>
              {active && (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={color}
                  style={s.genderCheck}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 3: Voice ─────────────────────────────────────────────────────────────

function VoiceStep({
  gender,
  selected,
  onSelect,
}: {
  gender: Gender;
  selected: string;
  onSelect: (v: string) => void;
}) {
  const voices = gender === "female" ? FEMALE_VOICES : MALE_VOICES;
  const color = gender === "female" ? C.female : C.male;
  const dim = gender === "female" ? C.femaleDim : C.maleDim;

  return (
    <View style={s.stepBody}>
      <Text style={s.stepTitle}>Pick your voice</Text>
      <Text style={s.stepSub}>All voices work fully offline</Text>
      <View style={s.voiceGrid}>
        {voices.map((v) => {
          const active = selected === v;
          return (
            <TouchableOpacity
              key={v}
              style={[
                s.voiceCard,
                active && { borderColor: color, backgroundColor: dim },
              ]}
              onPress={() => onSelect(v)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  s.voiceAvatar,
                  { backgroundColor: active ? color : C.cardHigh },
                ]}
              >
                <Text style={s.voiceInitial}>{v[0]}</Text>
              </View>
              <Text style={[s.voiceName, active && { color }]}>{v}</Text>
              <Text style={s.voiceDesc}>{VOICE_DESCRIPTIONS[v]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Step 4: Speed ─────────────────────────────────────────────────────────────

function SpeedStep({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (n: number) => void;
}) {
  return (
    <View style={s.stepBody}>
      <Text style={s.stepTitle}>Reading speed</Text>
      <Text style={s.stepSub}>1.2× is recommended for most people</Text>
      <View style={s.speedGrid}>
        {SPEED_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.speedChip, active && s.speedChipActive]}
              onPress={() => onSelect(opt.value)}
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
      <View style={s.speedPreview}>
        <Text style={s.speedPreviewValue}>
          {SPEED_OPTIONS.find((o) => o.value === selected)?.label ??
            `${selected}×`}
        </Text>
        <Text style={s.speedPreviewNote}>
          {selected <= 1.0
            ? "Slower, careful reading"
            : selected <= 1.5
              ? "Comfortable pace"
              : "Fast listener"}
        </Text>
      </View>
    </View>
  );
}

// ── Step 5: Download ──────────────────────────────────────────────────────────

function DownloadStep({
  userName,
  voiceName,
  speed,
  onComplete,
}: {
  userName: string;
  voiceName: string;
  speed: number;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"model" | "voices" | "init" | "done">(
    "model",
  );
  const [error, setError] = useState("");
  const progressAnim = useRef(new Animated.Value(0)).current;

  const dlOpacity = useRef(new Animated.Value(1)).current;
  const doneOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const startDownload = useCallback(async () => {
    if (isLoaded()) {
      setProgress(100);
      setPhase("done");
      return;
    }
    setError("");
    setPhase("model");
    try {
      await loadModel({
        onModelProgress: (p) => {
          setProgress(Math.round(p * 90));
          if (p >= 1) setPhase("voices");
        },
        onVoicesProgress: (p) => {
          setProgress(90 + Math.round(p * 8));
          if (p >= 1) setPhase("init");
        },
      });
      setProgress(100);
      setPhase("done");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    startDownload();
  }, [startDownload]);

  useEffect(() => {
    if (phase === "done") {
      Animated.timing(dlOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(doneOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          Animated.timing(btnOpacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }).start();
        });
      });
    }
  }, [phase]);

  const done = phase === "done";
  const dlLabel =
    phase === "model"
      ? "Downloading voice model…"
      : phase === "voices"
        ? "Loading voice data…"
        : phase === "init"
          ? "Initializing engine…"
          : "";

  return (
    <View style={s.dlWrap}>
      {/* Downloading state */}
      <Animated.View
        style={[
          s.dlInner,
          { opacity: dlOpacity, display: done ? "none" : "flex" },
        ]}
      >
        <Text style={s.dlTitle}>Setting up {voiceName}</Text>
        <Text style={s.dlPct}>{progress}%</Text>
        <View style={s.dlTrack}>
          <Animated.View
            style={[
              s.dlFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <Text style={[s.dlLabel, error ? { color: C.error } : null]}>
          {error || dlLabel}
        </Text>
        {error ? (
          <TouchableOpacity style={s.retryBtn} onPress={startDownload}>
            <Ionicons name="refresh" size={18} color={C.error} />
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>

      {/* Done state */}
      {done && (
        <>
          <Animated.View style={[s.doneInner, { opacity: doneOpacity }]}>
            <View style={s.checkCircle}>
              <Ionicons name="checkmark" size={32} color={C.bg} />
            </View>

            <Text style={s.doneTitle}>
              {userName ? `Ready for you, ${userName}` : "All ready"}
            </Text>
            <Text style={s.doneSub}>Your voice is set up and ready to go</Text>

            <View style={s.doneSummary}>
              <View style={s.summaryChip}>
                <Ionicons name="mic" size={14} color={C.primary} />
                <Text style={s.summaryText}>{voiceName}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryChip}>
                <Ionicons name="speedometer" size={14} color={C.primary} />
                <Text style={s.summaryText}>{speed}×</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View style={[s.doneFooter, { opacity: btnOpacity }]}>
            <TouchableOpacity
              style={s.startBtn}
              onPress={onComplete}
              activeOpacity={0.8}
            >
              <Text style={s.startBtnText}>Start Reading</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ── Dots ──────────────────────────────────────────────────────────────────────

function Dots({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.dotsRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            i === current ? s.dotActive : i < current ? s.dotDone : null,
          ]}
        />
      ))}
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [voice, setVoice] = useState("Bella");
  const [speed, setSpeed] = useState(1.2);

  function go(next: number) {
    setStep(next);
  }

  function selectGender(g: Gender) {
    setGender(g);
    setVoice(g === "female" ? FEMALE_VOICES[0] : MALE_VOICES[0]);
  }

  function selectVoice(v: string) {
    setVoice(v);
  }

  async function finish() {
    await saveSettings({
      onboardingDone: true,
      userName: name.trim(),
      gender,
      voice,
      speed,
    });
    router.replace("/home" as any);
  }

  // Config steps are 2-4 (gender, voice, speed)
  const showDots = step >= 2 && step <= 4;
  const showFooter = step >= 1 && step <= 4;
  const canGoBack = step >= 2 && step <= 4;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header — minimal */}
      {showDots && (
        <View style={s.header}>
          <Dots current={step - 2} total={3} />
        </View>
      )}

      {/* Content */}
      <View style={s.content}>
        {step === 0 && <HeyStep onContinue={() => go(1)} />}
        {step === 1 && <NameStep value={name} onChange={setName} />}
        {step >= 2 && step <= 4 && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: Spacing.lg }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 2 && (
              <GenderStep
                userName={name.trim()}
                selected={gender}
                onSelect={selectGender}
              />
            )}
            {step === 3 && (
              <VoiceStep
                gender={gender}
                selected={voice}
                onSelect={selectVoice}
              />
            )}
            {step === 4 && <SpeedStep selected={speed} onSelect={setSpeed} />}
          </ScrollView>
        )}
        {step === 5 && (
          <DownloadStep
            userName={name.trim()}
            voiceName={voice}
            speed={speed}
            onComplete={finish}
          />
        )}
      </View>

      {/* Footer */}
      {showFooter && (
        <View style={s.footer}>
          {canGoBack ? (
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => go(step - 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={C.textSub} />
              <Text style={s.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            style={[s.nextBtn, step === 1 && !name.trim() && { opacity: 0.3 }]}
            onPress={() => {
              Keyboard.dismiss();
              go(step + 1);
            }}
            disabled={step === 1 && !name.trim()}
            activeOpacity={0.8}
          >
            <Text style={s.nextText}>Continue</Text>
            <Ionicons name="chevron-forward" size={18} color={C.white} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  content: { flex: 1 },

  // Hey
  heyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  heyText: {
    fontSize: FontSize.giant,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.5,
  },
  heyHint: {
    position: "absolute",
    bottom: 60,
    fontSize: FontSize.small,
    color: C.textMuted,
  },

  // Shared step
  stepBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  stepTitle: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    marginBottom: Spacing.xs,
  },
  stepSub: {
    fontSize: FontSize.body,
    color: C.textSub,
    marginBottom: Spacing.xl,
  },

  // Name
  nameInput: {
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.heading,
    fontWeight: "600",
    color: C.text,
  },

  // Gender
  genderRow: { gap: 12 },
  genderCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: Spacing.md,
    gap: 14,
  },
  genderLabel: { fontSize: FontSize.title, fontWeight: "600", color: C.text },
  genderVoiceList: { fontSize: FontSize.caption, color: C.textSub, flex: 1 },
  genderCheck: { marginLeft: "auto" },

  // Voice
  voiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  voiceCard: {
    width: (SW - Spacing.lg * 2 - 12) / 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: Spacing.md,
    alignItems: "center",
    gap: 6,
  },
  voiceAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceInitial: { fontSize: 20, fontWeight: "700", color: C.text },
  voiceName: { fontSize: FontSize.body, fontWeight: "600", color: C.text },
  voiceDesc: {
    fontSize: FontSize.caption,
    color: C.textSub,
    textAlign: "center",
  },

  // Speed
  speedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: Spacing.lg,
  },
  speedChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  speedChipActive: { borderColor: C.primary, backgroundColor: C.primaryDim },
  speedText: { fontSize: FontSize.body, fontWeight: "600", color: C.textSub },
  speedTextActive: { color: C.primary },
  speedPreview: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  speedPreviewValue: {
    fontSize: 40,
    fontWeight: "800",
    color: C.primary,
    marginBottom: 2,
  },
  speedPreviewNote: { fontSize: FontSize.small, color: C.textSub },

  // Download
  dlWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  dlInner: { alignItems: "center", width: "100%" },
  dlTitle: {
    fontSize: FontSize.body,
    fontWeight: "500",
    color: C.textSub,
    marginBottom: Spacing.lg,
  },
  dlTrack: {
    width: "70%",
    height: 3,
    borderRadius: 2,
    backgroundColor: C.card,
    marginBottom: Spacing.xl,
    overflow: "hidden",
  },
  dlFill: { height: "100%", borderRadius: 2, backgroundColor: C.primary },
  dlPct: {
    fontSize: FontSize.giant,
    fontWeight: "700",
    color: C.text,
    marginBottom: Spacing.sm,
    letterSpacing: -1,
  },
  dlLabel: { fontSize: FontSize.small, color: C.textSub, textAlign: "center" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  retryText: { fontSize: FontSize.body, color: C.error, fontWeight: "600" },

  // Done state
  doneInner: { alignItems: "center", paddingHorizontal: Spacing.md },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  doneTitle: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  doneSub: {
    fontSize: FontSize.body,
    color: C.textSub,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  doneSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: 10,
  },
  summaryChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryText: { fontSize: FontSize.small, fontWeight: "600", color: C.text },
  summaryDivider: { width: 1, height: 16, backgroundColor: C.border },
  doneFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.lg,
  },
  startBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: Radius.sm,
  },
  startBtnText: { fontSize: FontSize.title, fontWeight: "700", color: C.white },

  // Dots
  dotsRow: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.primary, width: 22 },
  dotDone: { backgroundColor: C.textMuted },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.lg,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: Spacing.sm,
  },
  backText: { fontSize: FontSize.body, color: C.textSub },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderRadius: Radius.sm,
  },
  nextText: { fontSize: FontSize.body, fontWeight: "600", color: C.white },
});
