export type Span = { t: string; id?: number; b?: boolean; i?: boolean; s?: boolean };
export type Block = { id: string; kind: 'paragraph' | 'heading' | 'marker'; level: 2 | 3 | 4; spans: Span[]; bbox: number[]; indent: number; small: boolean };
export type PageMeta = { number: number; file: number; localPage: number; markers: string[]; nativeCharacters: number; sparse: boolean; tableCount: number; hasImages: boolean; hasOcr: boolean };
export type BookPage = PageMeta & { blocks: Block[]; figures: { url: string; bbox: number[]; kind: 'table' | 'image' }[]; ocr: { text: string; reviewed: boolean; note?: string } | null };
export type Chapter = { id: string; title: string; page: number; end: number; level: number; group: string };
export type Heading = { page: number; block: string; title: string; level: number };
export type Book = { title: string; shortTitle: string; edition: string; year: number; totalPages: number; nativeCharacters: number; chapters: Chapter[]; pages: PageMeta[]; headings: Heading[]; files: { name: string; start: number; end: number; pages: number; sha256: string; url: string; bytes: number }[] };
export type SearchResult = { page: number; chapter: string; snippet: string; score: number };
export type Settings = { theme: 'light' | 'dark'; size: number; width: 'standard' | 'wide' };
export type Position = { page: number; offset: number; updated: number };

export const asset = (path: string) => new URL(import.meta.env.BASE_URL + path, document.baseURI).href;
export function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function saveStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Reading remains available without storage. */ }
}
export const chapterAt = (book: Book, page: number) => [...book.chapters].reverse().find(c => c.page <= page) ?? book.chapters[0];
export const blockText = (block: Block) => block.spans.map(s => s.t).join('');
export const routeTo = (page: number, options: { view?: string; block?: string; q?: string; resume?: string } = {}) => {
  const params = new URLSearchParams(Object.entries(options).filter(([, value]) => value));
  return `#/read/${page}${params.size ? '?' + params.toString() : ''}`;
};
export function navigate(url: string) {
  if (location.hash === url) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = url;
}
