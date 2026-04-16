import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, Spacing, Radius, FontSize } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { setPending } from "@/lib/pending";
import {
  searchBooks,
  browseBooks,
  type SEBook,
} from "@/lib/standard-ebooks";

type Tab = "popular" | "newest";

export default function Library() {
  const [tab, setTab] = useState<Tab>("popular");
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<SEBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBooks = useCallback(
    async (q: string, t: Tab, page: number, append = false) => {
      try {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);
        setError("");

        const result = q.trim()
          ? await searchBooks(q.trim(), page)
          : await browseBooks(page, t === "newest" ? "newest" : "popularity");

        if (append) {
          setBooks((prev) => [...prev, ...result.books]);
        } else {
          setBooks(result.books);
        }
        setHasMore(result.hasMore);
      } catch (e) {
        setError("Failed to load books. Check your connection.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    pageRef.current = 1;
    fetchBooks("", tab, 1);
  }, [tab, fetchBooks]);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        pageRef.current = 1;
        fetchBooks(text, tab, 1);
      }, 500);
    },
    [tab, fetchBooks],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const next = pageRef.current + 1;
    pageRef.current = next;
    fetchBooks(query, tab, next, true);
  }, [loadingMore, hasMore, query, tab, fetchBooks]);

  const handleOpenBook = useCallback((book: SEBook) => {
    setPending(book.slug);
    router.push("/book-detail" as any);
  }, []);

  const renderBook = useCallback(
    ({ item }: { item: SEBook }) => (
      <TouchableOpacity
        style={s.bookCard}
        onPress={() => handleOpenBook(item)}
        activeOpacity={0.7}
      >
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={s.cover} />
        ) : (
          <View style={[s.cover, s.coverPlaceholder]}>
            <Ionicons name="book" size={20} color={C.textMuted} />
          </View>
        )}
        <View style={s.bookInfo}>
          <Text style={s.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author ? (
            <Text style={s.bookAuthor} numberOfLines={1}>
              By {item.author}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
      </TouchableOpacity>
    ),
    [handleOpenBook],
  );

  const separator = () => <View style={s.separator} />;

  return (
    <View style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Library"
          right={
            <TouchableOpacity
              hitSlop={12}
              onPress={() =>
                Alert.alert(
                  "About Library",
                  "All books are sourced from Standard Ebooks (standardebooks.org). Free, public domain books with professional-quality formatting.",
                )
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={C.textSub}
              />
            </TouchableOpacity>
          }
        />

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={C.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search books, authors..."
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query.length > 0 && Platform.OS === "android" && (
            <TouchableOpacity onPress={() => handleSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        {!query.trim() && (
          <View style={s.tabs}>
            {(["popular", "newest"] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.tab, tab === t && s.tabActive]}
                onPress={() => setTab(t)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === "popular" ? "Popular" : "Newest"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Error */}
        {error ? (
          <View style={s.errorWrap}>
            <Ionicons name="cloud-offline-outline" size={14} color={C.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Loading books...</Text>
          </View>
        ) : books.length === 0 ? (
          <View style={s.center}>
            <View style={s.emptyIcon}>
              <Ionicons name="search-outline" size={32} color={C.textMuted} />
            </View>
            <Text style={s.emptyTitle}>
              {query.trim() ? "No results" : "No books available"}
            </Text>
            <Text style={s.emptySub}>
              {query.trim()
                ? "Try a different search term"
                : "Check your connection"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.slug}
            renderItem={renderBook}
            ItemSeparatorComponent={separator}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={s.footerLoader}>
                  <ActivityIndicator size="small" color={C.primary} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Search ──
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.body,
    color: C.text,
    paddingVertical: Platform.OS === "ios" ? 13 : 11,
  },

  // ── Tabs ──
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  tabActive: {
    backgroundColor: C.primaryDim,
    borderColor: C.primary,
  },
  tabText: {
    fontSize: FontSize.small,
    fontWeight: "600",
    color: C.textSub,
  },
  tabTextActive: {
    color: C.primary,
  },

  // ── Error ──
  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(217,87,87,0.08)",
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: FontSize.small,
    color: C.error,
    flex: 1,
  },

  // ── Empty / Loading ──
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 60,
  },
  loadingText: {
    fontSize: FontSize.small,
    color: C.textSub,
    marginTop: 4,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.text,
  },
  emptySub: {
    fontSize: FontSize.small,
    color: C.textSub,
  },

  // ── List ──
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 4,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  separator: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 66,
    opacity: 0.5,
  },
  footerLoader: {
    paddingVertical: 24,
    alignItems: "center",
  },

  // ── Book card ──
  bookCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
  },
  cover: {
    width: 44,
    height: 64,
    borderRadius: 4,
    backgroundColor: C.card,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  bookInfo: {
    flex: 1,
    gap: 3,
  },
  bookTitle: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: C.text,
    lineHeight: 20,
  },
  bookAuthor: {
    fontSize: FontSize.small,
    color: C.textSub,
  },
});
