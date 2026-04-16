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
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  loadSettings,
  saveRecent,
  saveBookmark,
  loadBookmark,
  removeBookmark,
  type AppSettings,
  type Bookmark,
} from "@/lib/settings";
import { consumePending, consumePendingTitle } from "@/lib/pending";
import { stop } from "@/lib/tts";
import {
  extractDocument,
  splitIntoPages,
  type ExtractedDocument,
} from "@/lib/document-extract";
import { useSentencePlayer, splitSentences } from "@/hooks/useSentencePlayer";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

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
  const [docName, setDocName] = useState("");
  const [doc, setDoc] = useState<ExtractedDocument | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fontSizeIdx, setFontSizeIdx] = useState(2);
  const [currentPage, setCurrentPage] = useState(0);
  const [playingPage, setPlayingPage] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Consume pending data on focus (handles navigation from other screens)
  useFocusEffect(
    useCallback(() => {
      const pending = consumePending();
      const pendingTitle = consumePendingTitle();
      if (!pending) return;

      const isFile = pending.startsWith("file://") || pending.startsWith("/");

      // Reset state for new content
      setDoc(null);
      setCurrentPage(0);
      setPlayingPage(-1);
      setEditing(false);
      setBookmark(null);
      setError("");

      if (isFile) {
        setExtracting(true);
        setDocName(pendingTitle || "Document");
        extractDocument(pending, pendingTitle || "book.epub", "application/epub+zip")
          .then((extracted) => {
            setDoc(extracted);
            setDocName(pendingTitle || "Document");
            // Delete cached EPUB — text is in memory now
            FileSystem.deleteAsync(pending, { idempotent: true }).catch(() => {});
          })
          .catch((e) => {
            setError("Extract failed: " + String(e));
          })
          .finally(() => setExtracting(false));
      } else {
        setDocName(pendingTitle || "Document");
        setDoc({ type: "pdf", chapters: [pending], fullText: pending });
      }
    }, []),
  );

  // Load bookmark when doc changes
  useEffect(() => {
    if (docName) {
      loadBookmark(docName).then((bm) => {
        if (bm) {
          setBookmark(bm);
          setCurrentPage(bm.page);
        }
      });
    }
  }, [docName]);

  const player = useSentencePlayer({
    voice: settings?.voice ?? "Bella",
    speed: settings?.speed ?? 1.2,
  });

  // Pause and save bookmark when navigating away
  const playerRef = useRef(player);
  playerRef.current = player;
  const docNameRef = useRef(docName);
  docNameRef.current = docName;

  useFocusEffect(
    useCallback(() => {
      return () => {
        const p = playerRef.current;
        if (playingRef.current || p.phase === "playing") {
          p.pause();
          const name = docNameRef.current;
          if (name) {
            const sentIdx = p.activeIndex >= 0 ? p.activeIndex : 0;
            saveBookmark({
              docName: name,
              page: currentPageRef.current,
              sentenceIndex: sentIdx,
              timestamp: Date.now(),
            });
          }
        }
        playingRef.current = false;
        p.stop();
      };
    }, []),
  );

  const playing = player.phase === "playing";
  const paused = player.phase === "paused";
  const fontSize = FONT_SIZES[fontSizeIdx];

  // Split document into pages
  const pages = useMemo(() => {
    if (!doc) return [];
    const lineHeight = fontSize * 1.75;
    const linesPerPage = Math.floor((SCREEN_H - 260) / lineHeight);
    const charsPerLine = Math.floor((SCREEN_W - 56) / (fontSize * 0.52));
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
      setEditing(false);
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

  // Play current page, then auto-advance
  const playingRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const playingPageRef = useRef(-1);

  const playPage = useCallback(
    async (pageIdx: number, startFrom = 0, continuing = false) => {
      if (!doc || !settings || pageIdx >= pages.length) {
        playingRef.current = false;
        setPlayingPage(-1);
        playingPageRef.current = -1;
        return;
      }
      const pageText = pages[pageIdx];
      if (!pageText.trim()) {
        const next = pageIdx + 1;
        if (next < pages.length) {
          setCurrentPage(next);
          setPlayingPage(next);
          playingPageRef.current = next;
          scrollRef.current?.scrollTo({ y: 0, animated: false });
          playPage(next, 0, true);
        }
        return;
      }

      setPlayingPage(pageIdx);
      playingPageRef.current = pageIdx;

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

      await player.play(pageText, startFrom, { continuing });

      // Auto-advance to next page if not stopped
      if (playingRef.current && playingPageRef.current === pageIdx) {
        const next = pageIdx + 1;
        if (next < pages.length) {
          setCurrentPage(next);
          setPlayingPage(next);
          playingPageRef.current = next;
          scrollRef.current?.scrollTo({ y: 0, animated: false });
          playPage(next, 0, true);
        } else {
          playingRef.current = false;
          setPlayingPage(-1);
          playingPageRef.current = -1;
          if (docName) removeBookmark(docName);
        }
      }
    },
    [doc, docName, settings, player.play, pages],
  );

  const handlePlay = useCallback(() => {
    if (!doc || !settings) return;
    setEditing(false);
    playingRef.current = true;
    setBookmark(null);
    playPage(currentPage);
  }, [doc, settings, currentPage, playPage]);

  const handlePause = useCallback(async () => {
    player.pause();
    const sentIdx = player.pausedAtIndex >= 0 ? player.pausedAtIndex : player.activeIndex;
    if (docName) {
      const bm: Bookmark = {
        docName,
        page: currentPage,
        sentenceIndex: sentIdx >= 0 ? sentIdx : 0,
        timestamp: Date.now(),
      };
      await saveBookmark(bm);
      setBookmark(bm);
    }
  }, [player, docName, currentPage]);

  const handleResume = useCallback(() => {
    if (!doc || !settings) return;
    if (paused) {
      player.resume();
    } else if (bookmark) {
      setEditing(false);
      playingRef.current = true;
      setCurrentPage(bookmark.page);
      playPage(bookmark.page, bookmark.sentenceIndex);
      setBookmark(null);
    }
  }, [doc, settings, paused, bookmark, player, playPage]);

  const handleStop = useCallback(async () => {
    playingRef.current = false;
    setPlayingPage(-1);
    playingPageRef.current = -1;
    player.stop();
    if (docName) removeBookmark(docName);
    setBookmark(null);
  }, [player, docName]);

  const goToPage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, totalPages - 1));
      setCurrentPage(clamped);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    },
    [totalPages],
  );

  const words = doc ? wordCount(doc.fullText) : 0;
  const progress = totalPages > 0 ? (currentPage + 1) / totalPages : 0;

  // Sentences for bookmark view (when idle but bookmark exists)
  const bookmarkSentences = useMemo(() => {
    if (!bookmark || !pages[bookmark.page]) return [];
    return splitSentences(pages[bookmark.page]);
  }, [bookmark, pages]);

  const showSentences = playing || paused || (bookmark && bookmarkSentences.length > 0);
  const busy = player.phase === "loading" || playing || paused;
  const statusText = extracting
    ? "Extracting text..."
    : player.phase === "loading"
      ? "Loading engine..."
      : playing
        ? `Sentence ${player.activeIndex + 1} of ${player.sentences.length}`
        : paused
          ? "Paused"
          : player.phase === "error"
            ? player.error
            : bookmark
              ? `Bookmarked at page ${bookmark.page + 1}`
              : undefined;

  const currentText = pages[currentPage] ?? "";

  // Update doc text when editing
  const handleEditText = useCallback(
    (newText: string) => {
      if (!doc) return;
      const chapters = [...doc.chapters];
      // Replace the text for current page in the full text
      // Simpler: rebuild fullText from pages
      const newPages = [...pages];
      newPages[currentPage] = newText;
      const newFull = newPages.join("\n\n");
      setDoc({ ...doc, chapters: [newFull], fullText: newFull });
    },
    [doc, pages, currentPage],
  );

  // ── Empty state ──
  if (!doc && !extracting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
          <ScreenHeader title="Document" onBack={stop} />

          {/* Top — hero + features */}
          <View style={s.emptyTop}>
            <View style={s.heroSection}>
              <View style={s.heroIcon}>
                <Ionicons
                  name="document-text"
                  size={32}
                  color={C.primary}
                />
              </View>
              <Text style={s.heroTitle}>Import a document</Text>
              <Text style={s.heroSub}>
                PDF and EPUB files supported
              </Text>
            </View>

            <View style={s.featureList}>
              {[
                {
                  icon: "document-text-outline" as const,
                  label: "PDF",
                  desc: "Extract text from any PDF",
                },
                {
                  icon: "book-outline" as const,
                  label: "EPUB",
                  desc: "Full chapter-aware support",
                },
                {
                  icon: "volume-medium-outline" as const,
                  label: "Listen",
                  desc: "Read aloud with natural voices",
                },
                {
                  icon: "text-outline" as const,
                  label: "Customize",
                  desc: "Adjust font size, edit text",
                },
              ].map((f) => (
                <View key={f.label} style={s.featureItem}>
                  <View style={s.featureIcon}>
                    <Ionicons name={f.icon} size={16} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.featureLabel}>{f.label}</Text>
                    <Text style={s.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Bottom — CTA near thumb */}
          <View style={s.emptyBottom}>
            {error ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={C.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={s.importBtn}
              onPress={pickDocument}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={C.white} />
              <Text style={s.importBtnText}>Choose File</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Loading state ──
  if (extracting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
          <ScreenHeader title="Document" onBack={stop} />
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Extracting text...</Text>
            <Text style={s.loadingSub}>{docName}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Reader ──
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        {/* Header */}
        <View style={s.readerHeader}>
          <TouchableOpacity
            onPress={() => {
              stop();
              router.back();
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
              Page {currentPage + 1}/{totalPages} · {words.toLocaleString()} words
            </Text>
          </View>
          {doc && !busy ? (
            <TouchableOpacity
              onPress={() => setEditing((e) => !e)}
              hitSlop={12}
            >
              <Ionicons
                name={editing ? "checkmark" : "create-outline"}
                size={20}
                color={editing ? C.primary : C.textSub}
              />
            </TouchableOpacity>
          ) : busy ? (
            <View style={s.pageChip}>
              <Text style={s.pageChipText}>
                {currentPage + 1}/{totalPages}
              </Text>
            </View>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Font size controls */}
        <View style={s.fontBar}>
          <TouchableOpacity
            onPress={() => setFontSizeIdx((i) => Math.max(0, i - 1))}
            disabled={fontSizeIdx === 0}
            hitSlop={8}
          >
            <Text
              style={[
                s.fontBtn,
                fontSizeIdx === 0 && { color: C.textMuted },
              ]}
            >
              A-
            </Text>
          </TouchableOpacity>
          <Text style={s.fontLabel}>{fontSize}px</Text>
          <TouchableOpacity
            onPress={() =>
              setFontSizeIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))
            }
            disabled={fontSizeIdx === FONT_SIZES.length - 1}
            hitSlop={8}
          >
            <Text
              style={[
                s.fontBtn,
                fontSizeIdx === FONT_SIZES.length - 1 && {
                  color: C.textMuted,
                },
              ]}
            >
              A+
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={pickDocument} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          {(playing || paused) && currentPage === playingPage ? (
            <Text style={[s.pageText, { fontSize, lineHeight: fontSize * 1.75 }]}>
              {player.sentences.map((sentence, i) =>
                sentence === "\n" ? (
                  <Text key={i}>{"\n\n"}</Text>
                ) : (
                  <Text
                    key={i}
                    style={[
                      i === player.activeIndex && s.sentenceActive,
                      i < player.activeIndex && s.sentenceDone,
                    ]}
                  >
                    {sentence}{" "}
                  </Text>
                ),
              )}
            </Text>
          ) : bookmark && bookmarkSentences.length > 0 && currentPage === bookmark.page ? (
            <Text style={[s.pageText, { fontSize, lineHeight: fontSize * 1.75 }]}>
              {bookmarkSentences.map((sentence, i) =>
                sentence === "\n" ? (
                  <Text key={i}>{"\n\n"}</Text>
                ) : (
                  <Text
                    key={i}
                    style={[
                      i === bookmark.sentenceIndex && s.sentenceActive,
                      i < bookmark.sentenceIndex && s.sentenceDone,
                    ]}
                  >
                    {sentence}{" "}
                  </Text>
                ),
              )}
            </Text>
          ) : editing ? (
            <TextInput
              style={[
                s.pageText,
                s.editInput,
                { fontSize, lineHeight: fontSize * 1.75 },
              ]}
              value={currentText}
              onChangeText={handleEditText}
              multiline
              textAlignVertical="top"
              selectionColor={C.primary}
            />
          ) : (
            <Text
              style={[s.pageText, { fontSize, lineHeight: fontSize * 1.75 }]}
              selectable
            >
              {currentText}
            </Text>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View style={s.bottomBar}>
          {/* Row 1: status / voice info */}
          <View style={s.barTopRow}>
            <View style={s.barVoice}>
              <Ionicons name="mic" size={12} color={C.primary} />
              <Text style={s.barVoiceText}>
                {settings?.voice ?? "Bella"} · {settings?.speed ?? 1.2}×
              </Text>
            </View>
            {statusText ? (
              <Text
                style={[
                  s.barStatus,
                  player.phase === "error" && { color: C.error },
                ]}
                numberOfLines={1}
              >
                {statusText}
              </Text>
            ) : (
              <Text style={s.barPageInfo}>
                Page {currentPage + 1} of {totalPages}
              </Text>
            )}
          </View>

          {/* Row 2: controls */}
          <View style={s.barControls}>
            {/* Page prev */}
            <TouchableOpacity
              onPress={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              style={[s.barBtn, currentPage === 0 && s.barBtnDisabled]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={currentPage === 0 ? C.textMuted : C.textSub}
              />
            </TouchableOpacity>

            {/* Stop / Clear bookmark */}
            <TouchableOpacity
              style={[s.barBtn, !(playing || paused || bookmark) && s.barBtnDisabled]}
              onPress={handleStop}
              disabled={!(playing || paused || bookmark)}
              activeOpacity={0.7}
            >
              <Ionicons name="stop" size={16} color={C.textSub} />
            </TouchableOpacity>

            {/* Play / Resume — center */}
            {player.phase === "loading" || playing ? (
              <View style={s.playBtn}>
                <ActivityIndicator color={C.white} size="small" />
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  s.playBtn,
                  (!doc || player.phase === "error") && { opacity: 0.35 },
                ]}
                onPress={paused || bookmark ? handleResume : handlePlay}
                disabled={!doc}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="play"
                  size={22}
                  color={C.white}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            )}

            {/* Pause */}
            <TouchableOpacity
              style={[s.barBtn, !playing && s.barBtnDisabled]}
              onPress={handlePause}
              disabled={!playing}
              activeOpacity={0.7}
            >
              <Ionicons name="pause" size={16} color={C.textSub} />
            </TouchableOpacity>

            {/* Page next */}
            <TouchableOpacity
              onPress={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              style={[
                s.barBtn,
                currentPage >= totalPages - 1 && s.barBtnDisabled,
              ]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={
                  currentPage >= totalPages - 1 ? C.textMuted : C.textSub
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // ── Empty / Import state ──
  emptyTop: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyBottom: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 40 : Spacing.xl,
    gap: Spacing.sm,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: FontSize.heading,
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: FontSize.body,
    color: C.textSub,
    textAlign: "center",
    lineHeight: 22,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    width: "100%",
  },
  importBtnText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.white,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  errorText: { fontSize: FontSize.small, color: C.error, flex: 1 },
  featureList: {
    marginTop: Spacing.xl,
    gap: 0,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.text,
  },
  featureDesc: {
    fontSize: FontSize.small,
    color: C.textSub,
    marginTop: 1,
  },

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

  pageChip: {
    backgroundColor: C.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pageChipText: {
    fontSize: FontSize.caption,
    fontWeight: "700",
    color: C.primary,
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

  // ── Font bar ──
  fontBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  fontBtn: {
    fontSize: FontSize.body,
    fontWeight: "700",
    color: C.text,
  },
  fontLabel: {
    fontSize: FontSize.caption,
    color: C.textSub,
  },

  // ── Content ──
  scrollContent: {
    paddingHorizontal: 28,
    paddingVertical: 24,
    paddingBottom: 48,
  },
  pageText: {
    color: C.text,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    letterSpacing: 0.2,
  },
  editInput: {
    minHeight: 300,
    color: C.text,
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

  // ── Bottom bar ──
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 34 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.surface,
    gap: 10,
  },
  barTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barVoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barVoiceText: {
    fontSize: FontSize.caption,
    fontWeight: "500",
    color: C.textSub,
  },
  barStatus: {
    fontSize: FontSize.caption,
    fontWeight: "500",
    color: C.primary,
  },
  barPageInfo: {
    fontSize: FontSize.caption,
    color: C.textMuted,
  },
  barControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  barBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  barBtnDisabled: {
    opacity: 0.4,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
