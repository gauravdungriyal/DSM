# Website verification

Verified on 2026-10-02 using Node.js 25.2.1, Python 3.12, and Playwright Chromium.

- `npm run build`: passed (TypeScript and production Vite build).
- `npm test`: all 12 production browser tests passed in 28.3 seconds.
- `npm run validate`: passed for all 12 source files and 1,377 pages.
- Native text retained: 3,583,556 Unicode characters in 74,675 exact text spans.
- Native spans verified in the actual browser on 21 representative source pages,
  including pages from all twelve PDF parts, tables, and the final index page.
- Image text reviewed on source pages 1, 2, 6, 1122, and 1123.
- Original PDFs verified byte for byte with SHA-256 checksums.
- Production dependency audit: zero known vulnerabilities reported.
- Desktop and mobile layouts visually inspected; no horizontal document overflow
  in the tested 320 px and 375 px mobile layouts.
- Exact original-page rendering verified by checking the PDF file/page mapping
  and nonblank rendered canvas pixels.

The browser suite covers chapter navigation, full-book search (including text
available only in images), empty search states, keyboard dismissal, navigation
across PDF boundaries, PDF/text switching, page lookup, reading settings and
resume, continuous loading, recoverable loading errors, heading links/history,
mobile navigation, and first/last-page limits.

The production test server uses a dedicated port and refuses to reuse an existing
server. Development preview runs at http://127.0.0.1:5173 while the current server
process remains running; restart it with `npm run dev` when needed.

See [validation.md](validation.md) for the scope and limits of text-preservation
checks, including the distinction between automated span coverage and manual
proofreading of every page. The unchanged source PDFs are always the reference
for exact page layout.
