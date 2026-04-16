import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { loadSettings, saveRecent, type AppSettings } from "@/lib/settings";
import { consumePending } from "@/lib/pending";
import { stop } from "@/lib/tts";
import {
  extractDocument,
  splitIntoPages,
  type ExtractedDocument,
} from "@/lib/document-extract";
import { PlayerBar } from "@/components/PlayerBar";
import { useSentencePlayer } from "@/hooks/useSentencePlayer";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const PAGE_PADDING_H = 28;
const PAGE_PADDING_V = 24;

function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}
function readTime(w: number, spd: number) {
  const m = Math.ceil(w / (150 * spd));
  return m <= 1 ? "~1 min" : `~${m} min`;
}

const FONT_SIZES = [14, 16, 18, 20, 22];

export default function BookReader() {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const pending = consumePending();
  const [docName, setDocName] = useState(pending ? "Restored document" : "");
  const [doc, setDoc] = useState<ExtractedDocument | null>(
    pending ? { type: "pdf", chapters: [pending], fullText: pending } : null,
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fontSizeIdx, setFontSizeIdx] = useState(2); // 18px default
  const [showControls, setShowControls] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const player = useSentencePlayer({
    voice: settings?.voice ?? "Bella",
    speed: settings?.speed ?? 1.2,
  });

  const playing = player.phase === "playing";
  const fontSize = FONT_SIZES[fontSizeIdx];

  // Split document into pages
  const pages = useMemo(() => {
    if (!doc) return [];
    // Estimate chars per page based on font size and screen
    const lineHeight = fontSize * 1.75;
    const linesPerPage = Math.floor((SCREEN_H - 260) / lineHeight);
    const charsPerLine = Math.floor(
      (SCREEN_W - PAGE_PADDING_H * 2) / (fontSize * 0.52),
    );
    const charsPerPage = Math.max(400, linesPerPage * charsPerLine);

    const allPages: string[] = [];
    for (const chapter of doc.chapters) {
      const chapterPages = splitIntoPages(chapter, charsPerPage);
      allPages.push(...chapterPages);
    }
    return allPages;
  }, [doc, fontSize]);

  const totalPages = pages.length;

  // Pick document
  const pickDocument = useCallback(async () => {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/epub+zip"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setDocName(asset.name ?? "document");
      setDoc(null);
      setCurrentPage(0);
      setExtracting(true);
      const extracted = await extractDocument(
        asset.uri,
        asset.name ?? "",
        asset.mimeType,
      );
      setDoc(extracted);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
    }
  }, []);

  const savedRef = useRef("");

  const handlePlay = useCallback(() => {
    if (!doc || !settings) return;
    // Play from current page onward
    const textFromHere = pages.slice(currentPage).join("\n\n");
    if (!textFromHere.trim()) return;

    if (savedRef.current !== docName) {
      savedRef.current = docName;
      saveRecent({
        type: "book",
        title: docName || "Document",
        preview: doc.fullText.slice(0, 120).replace(/\n/g, " "),
        fullText: doc.fullText,
        words: wordCount(doc.fullText),
      });
    }
    player.play(textFromHere);
  }, [doc, docName, settings, player.play, pages, currentPage]);

  const goToPage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, totalPages - 1));
      setCurrentPage(clamped);
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
    },
    [totalPages],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentPage(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const toggleControls = useCallback(() => {
    if (!playing) setShowControls((v) => !v);
  }, [playing]);

  const words = doc ? wordCount(doc.fullText) : 0;
  const progress = totalPages > 0 ? (currentPage + 1) / totalPages : 0;

  const statusText = extracting
    ? "Extracting text..."
    : player.phase === "loading"
      ? "Loading engine..."
      : playing
        ? `Sentence ${player.activeIndex + 1} of ${player.sentences.length}`
        : player.phase === "error"
          ? player.error
          : undefined;

  // Render a single page
  const renderPage = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <View style={[s.page, { width: SCREEN_W }]}>
        {playing ? (
          // During playback, show sentence highlighting on current page only
          index === currentPage ? (
            <View style={s.sentenceView}>
              {player.sentences.map((sentence, i) => (
                <Text
                  key={i}
                  style={[
                    s.pageText,
                    { fontSize, lineHeight: fontSize * 1.75 },
                    i === player.activeIndex && s.sentenceActive,
                    i < player.activeIndex && s.sentenceDone,
                  ]}
                >
                  {sentence}{" "}
                </Text>
              ))}
            </View>
          ) : (
            <Text
              style={[s.pageText, { fontSize, lineHeight: fontSize * 1.75 }]}
              selectable
            >
              {item}
            </Text>
          )
        ) : (
          <Text
            style={[s.pageText, { fontSize, lineHeight: fontSize * 1.75 }]}
            selectable
            onPress={toggleControls}
          >
            {item}
          </Text>
        )}
      </View>
    ),
    [
      fontSize,
      playing,
      player.sentences,
      player.activeIndex,
      currentPage,
      toggleControls,
    ],
  );

  // Empty state — file picker
  if (!doc && !extracting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
          <ScreenHeader title="Book" onBack={stop} />
          <View style={s.emptyContainer}>
            <TouchableOpacity
              style={s.importCard}
              onPress={pickDocument}
              activeOpacity={0.8}
            >
              <View style={s.importIconWrap}>
                <Ionicons name="book-outline" size={40} color={C.primary} />
              </View>
              <Text style={s.importTitle}>Import a Book</Text>
              <Text style={s.importSub}>PDF or EPUB files supported</Text>
              <View style={s.importBtn}>
                <Ionicons
                  name="folder-open-outline"
                  size={18}
                  color={C.white}
                />
                <Text style={s.importBtnText}>Choose File</Text>
              </View>
            </TouchableOpacity>

            {error ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={C.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={s.formatRow}>
              <View style={s.formatTag}>
                <Ionicons name="document-text" size={14} color={C.accent} />
                <Text style={s.formatText}>PDF</Text>
              </View>
              <View style={s.formatTag}>
                <Ionicons name="book" size={14} color={C.primary} />
                <Text style={s.formatText}>EPUB</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Loading state
  if (extracting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
          <ScreenHeader title="Book" onBack={stop} />
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Extracting text...</Text>
            <Text style={s.loadingSub}>{docName}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Book reader
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        {/* Minimal header */}
        <View style={s.readerHeader}>
          <TouchableOpacity
            onPress={() => {
              stop();
              require("expo-router").router.back();
            }}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={C.textSub} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {docName}
            </Text>
            <Text style={s.headerMeta}>
              {currentPage + 1} of {totalPages} · {words.toLocaleString()} words
            </Text>
          </View>
          <TouchableOpacity onPress={pickDocument} hitSlop={12}>
            <Ionicons name="swap-horizontal" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Pages */}
        <FlatList
          ref={listRef}
          data={pages}
          renderItem={renderPage}
          keyExtractor={(_, i) => `p${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          initialScrollIndex={0}
          maxToRenderPerBatch={3}
          windowSize={5}
        />

        {/* Font size & page controls overlay */}
        {showControls && !playing && (
          <Animated.View
            entering={SlideInDown.duration(200)}
            exiting={SlideOutDown.duration(150)}
            style={s.controlsOverlay}
          >
            <View style={s.controlsRow}>
              <TouchableOpacity
                onPress={() => setFontSizeIdx((i) => Math.max(0, i - 1))}
                disabled={fontSizeIdx === 0}
                style={s.controlBtn}
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={fontSizeIdx === 0 ? C.textMuted : C.text}
                />
              </TouchableOpacity>
              <Text style={s.controlLabel}>Aa {fontSize}px</Text>
              <TouchableOpacity
                onPress={() =>
                  setFontSizeIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))
                }
                disabled={fontSizeIdx === FONT_SIZES.length - 1}
                style={s.controlBtn}
              >
                <Ionicons
                  name="add"
                  size={20}
                  color={
                    fontSizeIdx === FONT_SIZES.length - 1 ? C.textMuted : C.text
                  }
                />
              </TouchableOpacity>
            </View>

            {/* Page jump */}
            <View style={s.controlsRow}>
              <TouchableOpacity
                onPress={() => goToPage(currentPage - 1)}
                disabled={currentPage === 0}
                style={s.controlBtn}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={currentPage === 0 ? C.textMuted : C.text}
                />
              </TouchableOpacity>
              <Text style={s.controlLabel}>
                Page {currentPage + 1} / {totalPages}
              </Text>
              <TouchableOpacity
                onPress={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                style={s.controlBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={currentPage >= totalPages - 1 ? C.textMuted : C.text}
                />
              </TouchableOpacity>
            </View>

            <Text style={s.controlHint}>
              {readTime(words, settings?.speed ?? 1.2)} read · Swipe to turn
              pages
            </Text>
          </Animated.View>
        )}

        {/* Tap zones for page turning (invisible) */}
        {!showControls && !playing && totalPages > 1 && (
          <>
            <TouchableOpacity
              style={s.tapZoneLeft}
              onPress={() => goToPage(currentPage - 1)}
              activeOpacity={1}
            />
            <TouchableOpacity
              style={s.tapZoneRight}
              onPress={() => goToPage(currentPage + 1)}
              activeOpacity={1}
            />
            <TouchableOpacity
              style={s.tapZoneCenter}
              onPress={toggleControls}
              activeOpacity={1}
            />
          </>
        )}

        <PlayerBar
          phase={
            extracting
              ? "loading"
              : playing
                ? "synthesizing"
                : player.phase === "loading"
                  ? "loading"
                  : player.phase === "error"
                    ? "error"
                    : "idle"
          }
          voiceName={settings?.voice ?? "Bella"}
          speed={settings?.speed ?? 1.2}
          disabled={!doc}
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

  // ── Empty state ──
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  importCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  importIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  importTitle: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    marginBottom: 4,
  },
  importSub: {
    fontSize: FontSize.small,
    color: C.textSub,
    marginBottom: Spacing.lg,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  importBtnText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.white,
  },
  formatRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: Spacing.lg,
  },
  formatTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  formatText: {
    fontSize: FontSize.small,
    color: C.textSub,
    fontWeight: "500",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
    width: "100%",
    maxWidth: 320,
  },
  errorText: { fontSize: FontSize.small, color: C.error, flex: 1 },

  // ── Loading state ──
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: FontSize.title,
    fontWeight: "600",
    color: C.text,
  },
  loadingSub: {
    fontSize: FontSize.small,
    color: C.textSub,
  },

  // ── Reader header ──
  readerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontSize: FontSize.small,
    fontWeight: "600",
    color: C.text,
  },
  headerMeta: {
    fontSize: FontSize.caption,
    color: C.textMuted,
    marginTop: 1,
  },

  // ── Progress bar ──
  progressTrack: {
    height: 2,
    backgroundColor: C.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: C.primary,
  },

  // ── Page ──
  page: {
    paddingHorizontal: PAGE_PADDING_H,
    paddingVertical: PAGE_PADDING_V,
    flex: 1,
  },
  pageText: {
    color: C.text,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    letterSpacing: 0.2,
  },

  sentenceView: {
    flexDirection: "row",
    flexWrap: "wrap",
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

  // ── Controls overlay ──
  controlsOverlay: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 110 : 90,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderHi,

    // Shadow
    shadowColor: C.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.text,
    minWidth: 100,
    textAlign: "center",
  },
  controlHint: {
    fontSize: FontSize.caption,
    color: C.textMuted,
    textAlign: "center",
  },

  // ── Tap zones (invisible) ──
  tapZoneLeft: {
    position: "absolute",
    left: 0,
    top: 80,
    bottom: 100,
    width: SCREEN_W * 0.25,
  },
  tapZoneRight: {
    position: "absolute",
    right: 0,
    top: 80,
    bottom: 100,
    width: SCREEN_W * 0.25,
  },
  tapZoneCenter: {
    position: "absolute",
    left: SCREEN_W * 0.25,
    right: SCREEN_W * 0.25,
    top: 80,
    bottom: 100,
  },
});
