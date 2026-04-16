import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { setPending } from "@/lib/pending";
import { consumePending } from "@/lib/pending";
import {
  fetchBookDetail,
  getEpubUrl,
  type SEBookDetail,
} from "@/lib/standard-ebooks";

export default function BookDetail() {
  const slugRef = useRef<string | null>(null);
  if (slugRef.current === null) slugRef.current = consumePending();
  const slug = slugRef.current;
  const [detail, setDetail] = useState<SEBookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    fetchBookDetail(slug)
      .then(setDetail)
      .catch(() => setError("Failed to load book details"))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async () => {
    if (!detail) return;
    setDownloading(true);
    setError("");
    try {
      const epubUrl = getEpubUrl(detail.slug);
      const localPath =
        (FileSystem.cacheDirectory ?? "") +
        detail.slug.replace("/", "_") +
        ".epub";

      const dl = await FileSystem.downloadAsync(epubUrl, localPath);
      if (dl.status < 200 || dl.status >= 300)
        throw new Error(`HTTP ${dl.status}`);

      setPending(dl.uri, detail.title);
      router.push("/book" as any);
    } catch (e) {
      setError("Download failed: " + String(e));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={s.root}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <ScreenHeader title="Book" />
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={s.root}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <ScreenHeader title="Book" />
          <View style={s.center}>
            <Ionicons name="warning-outline" size={32} color={C.textMuted} />
            <Text style={s.errorText}>{error || "Book not found"}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScreenHeader title="" />

        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover + basic info */}
          <View style={s.hero}>
            <Image source={{ uri: detail.coverUrl }} style={s.cover} />
            <Text style={s.title}>{detail.title}</Text>
            <Text style={s.author}>{detail.author}</Text>

            {/* Meta pills */}
            <View style={s.metaRow}>
              {detail.wordCount ? (
                <View style={s.pill}>
                  <Ionicons name="document-text-outline" size={12} color={C.textSub} />
                  <Text style={s.pillText}>{detail.wordCount}</Text>
                </View>
              ) : null}
              {detail.readingTime ? (
                <View style={s.pill}>
                  <Ionicons name="time-outline" size={12} color={C.textSub} />
                  <Text style={s.pillText}>{detail.readingTime}</Text>
                </View>
              ) : null}
              {detail.readingEase ? (
                <View style={s.pill}>
                  <Ionicons name="speedometer-outline" size={12} color={C.textSub} />
                  <Text style={s.pillText}>{detail.readingEase} ease</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Description */}
          {detail.description ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>About</Text>
              <Text style={s.description}>{detail.description}</Text>
            </View>
          ) : null}

          {/* Subjects */}
          {detail.subjects.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Subjects</Text>
              <View style={s.tagsRow}>
                {detail.subjects.map((tag) => (
                  <View key={tag} style={s.tag}>
                    <Text style={s.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Error */}
          {error ? (
            <Text style={s.dlError}>{error}</Text>
          ) : null}
        </ScrollView>

        {/* Bottom CTA */}
        <View style={s.bottom}>
          <TouchableOpacity
            style={[s.downloadBtn, downloading && { opacity: 0.6 }]}
            onPress={handleDownload}
            disabled={downloading}
            activeOpacity={0.8}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Ionicons name="book-outline" size={18} color={C.white} />
            )}
            <Text style={s.downloadText}>
              {downloading ? "Downloading..." : "Read this book"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: { fontSize: FontSize.body, color: C.textSub },

  content: {
    paddingBottom: 20,
  },

  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  cover: {
    width: 140,
    height: 200,
    borderRadius: 8,
    backgroundColor: C.card,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
    marginBottom: 4,
  },
  author: {
    fontSize: FontSize.body,
    color: C.textSub,
    textAlign: "center",
    marginBottom: Spacing.md,
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: FontSize.caption,
    color: C.textSub,
  },

  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: FontSize.body,
    color: C.text,
    lineHeight: 22,
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: FontSize.caption,
    color: C.textSub,
  },

  dlError: {
    fontSize: FontSize.small,
    color: C.error,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  bottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === "ios" ? 34 : Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  downloadText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.white,
  },
});
