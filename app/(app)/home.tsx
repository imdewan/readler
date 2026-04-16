import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import {
  loadSettings,
  loadRecent,
  type AppSettings,
  type RecentItem,
} from "@/lib/settings";
import { setPending } from "@/lib/pending";

function greetingTime() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [clipPreview, setClipPreview] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings);
      loadRecent().then(setRecent);
      Clipboard.getString()
        .then((c) => setClipPreview(c?.trim().slice(0, 80) || ""))
        .catch(() => setClipPreview(""));
    }, []),
  );

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe}>
        <View style={s.top}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.greeting}>Good {greetingTime()},</Text>
              {settings?.userName ? (
                <Text style={s.name}>{settings.userName}</Text>
              ) : null}
            </View>
            <View style={s.headerRight}>
              {settings && (
                <TouchableOpacity
                  style={s.voicePill}
                  onPress={() => router.push("/settings" as any)}
                  activeOpacity={0.7}
                >
                  <Text style={s.pillText}>{settings.voice}</Text>
                  <Text style={s.pillSpeed}>{settings.speed}×</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.settingsBtn}
                onPress={() => router.push("/settings" as any)}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Middle content */}
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.midContent}
          >
            {/* Quick paste */}
            {clipPreview.length > 0 && (
              <TouchableOpacity
                style={s.pasteCard}
                onPress={() => router.push("/reader" as any)}
                activeOpacity={0.8}
              >
                <View style={s.pasteHeader}>
                  <Ionicons name="clipboard" size={14} color={C.primary} />
                  <Text style={s.pasteLabel}>From clipboard</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.primary} />
                </View>
                <Text style={s.pastePreview} numberOfLines={2}>
                  {clipPreview}
                </Text>
              </TouchableOpacity>
            )}

            {/* Recent */}
            {recent.length > 0 && (
              <View style={s.recentSection}>
                <Text style={s.recentTitle}>Recent</Text>
                {recent.slice(0, 5).map((item, i) => (
                  <TouchableOpacity
                    key={`${item.timestamp}-${i}`}
                    style={s.recentCard}
                    onPress={() => {
                      setPending(item.fullText);
                      router.push(
                        item.type === "pdf" || item.type === "book"
                          ? ("/book" as any)
                          : ("/reader" as any),
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        s.recentIcon,
                        {
                          backgroundColor:
                            item.type !== "text" ? C.accentDim : C.primaryDim,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.type !== "text" ? "book" : "document-text"}
                        size={16}
                        color={item.type !== "text" ? C.accent : C.primary}
                      />
                    </View>
                    <View style={s.recentBody}>
                      <Text style={s.recentName} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={s.recentMeta}>
                        {item.words} words · {timeAgo(item.timestamp)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Tips — shown when nothing else */}
            {clipPreview.length === 0 && recent.length === 0 && (
              <View style={s.tips}>
                <View style={s.tipCard}>
                  <Ionicons name="copy-outline" size={18} color={C.textSub} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tipText}>
                      Copy text from any app, come back here
                    </Text>
                  </View>
                </View>
                <View style={s.tipCard}>
                  <Ionicons
                    name="document-outline"
                    size={18}
                    color={C.textSub}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tipText}>
                      Import a PDF or EPUB to listen on the go
                    </Text>
                  </View>
                </View>
                <View style={s.tipCard}>
                  <Ionicons name="wifi-outline" size={18} color={C.textSub} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tipText}>
                      Works completely offline, no data needed
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Bottom panel */}
      <View style={s.panel}>
        <Text style={s.panelTitle}>Start listening</Text>

        <TouchableOpacity
          style={s.actionCard}
          onPress={() => router.push("/reader" as any)}
          activeOpacity={0.8}
        >
          <View style={[s.actionIcon, { backgroundColor: C.primaryDim }]}>
            <Ionicons
              name="document-text-outline"
              size={22}
              color={C.primary}
            />
          </View>
          <View style={s.actionBody}>
            <Text style={s.actionTitle}>Text</Text>
            <Text style={s.actionSub}>Type or paste to listen</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionCard}
          onPress={() => router.push("/book" as any)}
          activeOpacity={0.8}
        >
          <View style={[s.actionIcon, { backgroundColor: C.accentDim }]}>
            <Ionicons name="book-outline" size={22} color={C.accent} />
          </View>
          <View style={s.actionBody}>
            <Text style={s.actionTitle}>Book</Text>
            <Text style={s.actionSub}>
              Import PDF or EPUB to read and listen
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <Text style={s.footer}>Fully offline · Readler</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },

  top: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSize.body, fontWeight: "500", color: C.textSub },
  name: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pillText: { fontSize: FontSize.caption, fontWeight: "600", color: C.text },
  pillSpeed: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: C.textSub,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  midContent: { paddingBottom: Spacing.md },

  // Tips
  tips: { gap: 0 },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tipText: { fontSize: FontSize.small, color: C.textSub, lineHeight: 18 },

  // Quick paste
  pasteCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  pasteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  pasteLabel: {
    fontSize: FontSize.small,
    fontWeight: "600",
    color: C.primary,
    flex: 1,
  },
  pastePreview: { fontSize: FontSize.small, color: C.textSub, lineHeight: 18 },

  // Recent
  recentSection: { marginTop: Spacing.xs },
  recentTitle: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recentBody: { flex: 1 },
  recentName: { fontSize: FontSize.small, fontWeight: "600", color: C.text },
  recentMeta: { fontSize: FontSize.caption, color: C.textMuted, marginTop: 1 },

  // Bottom panel
  panel: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 40 : Spacing.xl,
  },
  panelTitle: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    marginBottom: Spacing.md,
  },

  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBody: { flex: 1 },
  actionTitle: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.text,
    marginBottom: 1,
  },
  actionSub: { fontSize: FontSize.small, color: C.textSub },

  footer: {
    textAlign: "center",
    fontSize: FontSize.caption,
    color: C.textMuted,
    marginTop: Spacing.sm,
  },
});
