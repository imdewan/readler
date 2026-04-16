const BASE = "https://standardebooks.org";

export interface SEBook {
  title: string;
  author: string;
  slug: string; // e.g. "jane-austen/pride-and-prejudice"
  coverUrl: string;
}

/**
 * Search Standard Ebooks catalog by scraping HTML results.
 * Returns up to `perPage` books matching the query.
 */
export async function searchBooks(
  query: string,
  page = 1,
  perPage = 24,
): Promise<{ books: SEBook[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    query,
    "per-page": String(perPage),
    sort: "relevance",
    view: "grid",
  });
  if (page > 1) params.set("page", String(page));

  const url = `${BASE}/ebooks?${params}`;
  const html = await fetch(url).then((r) => r.text());
  return { books: parseListing(html), hasMore: html.includes('rel="next"') };
}

/**
 * Browse popular / newest books (no query).
 */
export async function browseBooks(
  page = 1,
  sort: "newest" | "popularity" | "reading-ease" = "popularity",
  perPage = 24,
): Promise<{ books: SEBook[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    "per-page": String(perPage),
    sort,
    view: "grid",
  });
  if (page > 1) params.set("page", String(page));

  const url = `${BASE}/ebooks?${params}`;
  const html = await fetch(url).then((r) => r.text());
  return { books: parseListing(html), hasMore: html.includes('rel="next"') };
}

function parseListing(html: string): SEBook[] {
  const books: SEBook[] = [];
  // Match each <li typeof="schema:Book"> block
  const itemRegex =
    /<li[^>]*typeof="schema:Book"[^>]*>[\s\S]*?<\/li>/gi;
  const items = html.match(itemRegex) || [];

  for (const item of items) {
    // Extract book URL slug: /ebooks/author/title
    const hrefMatch = item.match(/href="\/ebooks\/([^"]+)"/);
    if (!hrefMatch) continue;
    const slug = hrefMatch[1];

    // Extract title
    const titleMatch = item.match(
      /property="schema:name"[^>]*>([^<]+)<\/span>/,
    );
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1].trim())
      : slug.split("/").pop()?.replace(/-/g, " ") || "";

    // Extract author — name is in <span> inside <a> inside <p class="author">
    const authorMatch = item.match(
      /<p class="author"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/,
    );
    const author = authorMatch
      ? decodeHtmlEntities(authorMatch[1].trim())
      : "";

    // Extract cover image (prefer jpg)
    const imgMatch = item.match(
      /src="([^"]*cover[^"]*\.jpg[^"]*)"/,
    );
    const coverUrl = imgMatch ? BASE + imgMatch[1] : "";

    books.push({ title, author, slug, coverUrl });
  }

  return books;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018");
}

/**
 * Get the EPUB download URL for a book.
 * slug format: "author-slug/book-slug"
 */
export function getEpubUrl(slug: string): string {
  // URL pattern: /ebooks/{slug}/downloads/{author}_{title}.epub
  const fileName = slug.replace("/", "_");
  return `${BASE}/ebooks/${slug}/downloads/${fileName}.epub`;
}

/**
 * Get cover image URL (high quality).
 */
export function getCoverUrl(slug: string): string {
  return `${BASE}/images/covers/${slug.replace("/", "_")}-cover.jpg`;
}

export interface SEBookDetail {
  title: string;
  author: string;
  slug: string;
  coverUrl: string;
  description: string;
  wordCount: string;
  readingTime: string;
  readingEase: string;
  subjects: string[];
  language: string;
}

/**
 * Fetch full detail for a single book by scraping its page.
 */
export async function fetchBookDetail(slug: string): Promise<SEBookDetail> {
  const url = `${BASE}/ebooks/${slug}`;
  const html = await fetch(url).then((r) => r.text());

// Description — inside <section id="description">
  const descMatch = html.match(
    /<section id="description"[^>]*>[\s\S]*?<\/h2>\s*([\s\S]*?)<\/section>/i,
  );
  const descHtml = descMatch ? descMatch[1] : "";
  const description = stripHtml(descHtml).trim();

  // Word count
  const wordMatch = html.match(/([\d,]+)\s*words/);
  const wordCount = wordMatch ? wordMatch[1] + " words" : "";

  // Reading time
  const timeMatch = html.match(/(\d+\s*hours?\s*\d*\s*minutes?)/i);
  const readingTime = timeMatch ? timeMatch[1] : "";

  // Reading ease
  const easeMatch = html.match(/([\d.]+)\s*reading ease/);
  const readingEase = easeMatch ? easeMatch[1] : "";

  // Subjects from tags
  const subjectRegex = /<a[^>]*href="\/subjects\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  const subjects: string[] = [];
  let sm;
  while ((sm = subjectRegex.exec(html)) !== null) {
    const s = decodeHtmlEntities(sm[1].trim());
    if (!subjects.includes(s)) subjects.push(s);
  }

  // Language
  const langMatch = html.match(/xml:lang="([^"]+)"/);
  const language = langMatch ? langMatch[1] : "en";

  // Title — inside <h1 property="schema:name">
  const titleMatch = html.match(
    /<h1[^>]*property="schema:name"[^>]*>([^<]+)<\/h1>/,
  );
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : slug;

  // Author — <span property="schema:name"> inside <a property="schema:author">
  const authorMatch = html.match(
    /property="schema:author"[\s\S]*?<span[^>]*>([^<]+)<\/span>/,
  );
  const author = authorMatch ? decodeHtmlEntities(authorMatch[1].trim()) : "";

  return {
    title,
    author,
    slug,
    coverUrl: getCoverUrl(slug),
    description,
    wordCount,
    readingTime,
    readingEase,
    subjects,
    language,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeMoreEntities(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
