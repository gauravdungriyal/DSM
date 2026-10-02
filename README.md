# DSM-5-TR — The Reading Room

A local, searchable website built from the twelve PDFs in `book-parts`. The main
reader is reflowable text. Every page also has an original PDF view.

## Open the website

```powershell
cd D:\Surya
npm install
npm run dev
```

Open the local URL printed by Vite, normally **http://127.0.0.1:5173**.
The generated book content is included in `public/book`, so Python is not needed
just to run or build the website. Use Node.js 22.13+ (tested with Node 25.2.1).

## Features

- Complete 1,377-page reading sequence across all twelve files.
- 47 chapter/section entries, chapter filtering, and a subsection outline.
- Full-book search with excerpts and highlighted matches, including image text.
- Continuous reading with pages loaded as you scroll.
- Source-page and printed-page-marker lookup, including Roman numerals.
- Text/original-page switch, PDF zoom, and a link to the source PDF.
- Original illustrations and table images alongside the extracted text.
- Adjustable text size and reading width, light/dark themes, and mobile navigation.
- Reading position and preferences saved in the current browser.
- Chapter, source-page, and heading permalinks; browser back/forward navigation.
- Keyboard search: **Ctrl+K**, **Cmd+K**, or **/**. **Escape** closes dialogs.

There is no account, server database, analytics, or external font dependency.
Search runs in a browser worker. Assets are served locally. Offline installation,
annotations, highlights saved as notes, and account syncing are not implemented.

## Preservation and validation

The original files in `book-parts` are unchanged. Exact copies are served from
`public/book/originals`, with SHA-256 hashes in the manifest. Raw native text is
also retained separately for every source page.

Each native text span carries an ID linking it to the original extraction order.
The reader uses coordinates to arrange paragraphs and inline labels, preserves
bold/italic/superscript styling, and adds spaces between original lines. It does
not summarize, rewrite, or delete native text. Hard hyphens remain as supplied.

The validation script independently reopens every source PDF and checks:

- Source/copy hashes, consecutive source ranges, and all page mappings.
- Byte-exact raw UTF-8 text and the exact text and uniqueness of every native span.
- Agreement between native text and extracted span character counts.
- Complete inclusion of reading text and image transcriptions in the search index.
- All embedded raster images, chapter ranges, and heading links.

The covers, publisher logos, and the two scanned WHODAS forms have visually checked
transcriptions in `scripts/ocr-reviewed.json`, bound to the source file hashes.
The original images preserve table cell relationships and blank fields. Automatic
table detection additionally preserves images of eleven native table pages.

**Source numbering and printed numbering differ.** Some source pages contain
multiple printed markers; some have none. Printed-page lookup jumps to an explicit
marker found in the supplied PDFs. It never guesses a page offset. All 33 source
pages containing only a printed marker are retained.

Automated text checks prove native span coverage, not the correctness of every
visual reading-order or table interpretation. The original-page view remains the
reference for exact formatting. Visual checks cover representative narrative,
criteria, tables, appendix/index pages, and all image-only/sparse pages; the entire
book has not been manually proofread. See [the preservation report](reports/validation.md)
and [per-page verification data](reports/validation.json).

## Rebuild content from the PDFs

```powershell
python -m pip install -r requirements.txt
npm run extract
npm run validate
```

`extract_book.py` reads PDFs in numeric filename order and rejects missing or
overlapping ranges. It writes the manifest, per-page data, native text, original
images, and search index. Current reviewed image transcriptions are reused only
when their source hash matches. New image-only pages use OCR and must be reviewed;
validation fails if an image transcript is still unreviewed.

`review_transcripts.py` records the manual transcriptions of this specific edition.
Do not use it to certify replacement PDFs without inspecting their images.

## Build and test

```powershell
npm run build
npx playwright install chromium
npm test
npm run preview
```

The Playwright suite runs against the production build and covers search,
source-file boundaries, PDF rendering, page lookup, reading preferences/resume,
continuous reading, deep links/history, load failures, mobile layout, and rendered
native spans from all twelve source files. The extraction validator checks every
page, independently of those browser checks.

To host it, serve the contents of `dist` with any static HTTP server. Hash-based
reader URLs need no server rewrite rules. The build uses relative asset paths and
can be served from a subdirectory. Do not open `index.html` with `file://`; the
reader needs HTTP to load its content. No deployment is performed by these scripts.

## Project map

| Path | Purpose |
| --- | --- |
| `book-parts/` | Supplied PDFs, unchanged |
| `scripts/extract_book.py` | Repeatable content extraction |
| `scripts/validate_book.py` | Independent preservation validation |
| `scripts/ocr-reviewed.json` | Reviewed image text and source hashes |
| `public/book/manifest.json` | Chapters, headings, page mappings, source hashes |
| `public/book/pages/` | Reflowable native spans and page illustrations |
| `public/book/raw/` | Exact native text for every page |
| `public/book/originals/` | Byte-identical PDFs used by original-page view |
| `src/App.tsx` | Reader, navigation, search dialog, preferences |
| `src/search.worker.ts` | Background full-book search |
| `src/PdfPage.tsx` | Lazy-loaded PDF.js original-page renderer |
| `tests/reader.spec.ts` | Production browser tests |
| `reports/` | Preservation and delivery verification reports |

Implementation references: [PyMuPDF text extraction](https://pymupdf.readthedocs.io/en/latest/app1.html)
and [PDF.js rendering examples](https://mozilla.github.io/pdf.js/examples/).
