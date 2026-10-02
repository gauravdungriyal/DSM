"""Independently compare generated reader data with every original PDF page."""
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'book'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    book = read_json(OUT / 'manifest.json')
    search = read_json(OUT / 'search.json')
    failures, checked, empty_markers, ocr_pages, tables, unusual = [], [], [], [], [], []
    native_spans, native_characters = 0, 0

    def check(condition, description):
        if not condition:
            failures.append(description)

    check([p['number'] for p in book['pages']] == list(range(1, book['totalPages'] + 1)), 'Manifest page coverage/order')
    check([p['page'] for p in search] == list(range(1, book['totalPages'] + 1)), 'Search index page coverage/order')
    seen = []
    for fi, file in enumerate(book['files']):
        source = ROOT / 'book-parts' / file['name']
        source_hash = sha(source.read_bytes())
        check(source_hash == file['sha256'], f"Source checksum: {file['name']}")
        check(sha((OUT / 'originals' / file['name']).read_bytes()) == source_hash, f"Copied PDF checksum: {file['name']}")
        doc = pymupdf.open(source)
        check(len(doc) == file['pages'] == file['end'] - file['start'] + 1, f"Source page count: {file['name']}")
        for i, page in enumerate(doc):
            num = file['start'] + i
            seen.append(num)
            record = read_json(OUT / 'pages' / f'{num}.json')
            raw = page.get_text('text', flags=pymupdf.TEXTFLAGS_TEXT)
            check((OUT / 'raw' / f'{num}.txt').read_bytes() == raw.encode('utf-8'), f'Raw text exact match: {num}')
            check(sha(raw.encode('utf-8')) == record['nativeTextSha256'], f'Native text checksum: {num}')
            check(record['file'] == fi and record['localPage'] == i + 1 and record['number'] == num, f'Page mapping: {num}')
            spans = [s['text'] for b in page.get_text('dict', flags=pymupdf.TEXTFLAGS_TEXT)['blocks'] if b['type'] == 0 for line in b['lines'] for s in line['spans']]
            exported = sorted([s for b in record['blocks'] for s in b['spans'] if 'id' in s], key=lambda s: s['id'])
            check([s['id'] for s in exported] == list(range(len(spans))), f'Every source span appears exactly once: {num}')
            check([s['t'] for s in exported] == spans, f'Every source span retains exact Unicode text: {num}')
            check(Counter(re.sub(r'\s', '', raw)) == Counter(re.sub(r'\s', '', ''.join(spans))), f'Native extraction/dictionary character agreement: {num}')
            reading = '\n\n'.join(''.join(s['t'] for s in b['spans']) for b in record['blocks'])
            if record['ocr']:
                reading += '\n' + record['ocr']['text']
                ocr_pages.append(num)
                check(record['ocr']['reviewed'], f'Image transcript reviewed: {num}')
                check(record['ocr']['sourceSha256'] == source_hash, f'Transcript bound to source checksum: {num}')
            check(search[num - 1]['text'] == reading, f'Entire reading text is searchable: {num}')
            for figure in record['figures']:
                check((ROOT / 'public' / figure['url']).is_file(), f'Figure available: {num} / {figure["url"]}')
            original_images = len(page.get_image_info())
            check(len([f for f in record['figures'] if f['kind'] == 'image']) == original_images, f'Every embedded raster image retained: {num}')
            if record['sparse'] and not record['figures']:
                empty_markers.append(num)
            if record['tableCount']:
                tables.append(num)
            if '\ufffd' in raw or '\x00' in raw:
                unusual.append(num)
            native_spans += len(spans)
            native_characters += len(raw)
            checked.append({'page': num, 'characters': len(raw), 'spans': len(spans), 'nativeTextSha256': record['nativeTextSha256']})
    check(seen == list(range(1, book['totalPages'] + 1)), 'Original ranges contain no gaps/overlaps')
    for c in book['chapters']:
        check(1 <= c['page'] <= c['end'] <= book['totalPages'], f'Chapter range: {c["title"]}')
    for h in book['headings']:
        page = read_json(OUT / 'pages' / f'{h["page"]}.json')
        check(any(b['id'] == h['block'] and ''.join(s['t'] for s in b['spans']) == h['title'] for b in page['blocks']), f'Heading target: {h["page"]}/{h["block"]}')
    report = {'status': 'PASS' if not failures else 'FAIL', 'checkedAt': datetime.now(timezone.utc).isoformat(),
              'sourceFiles': len(book['files']), 'pagesVerified': len(checked), 'nativeCharacters': native_characters,
              'nativeSpansVerified': native_spans, 'chaptersAndSections': len(book['chapters']), 'headings': len(book['headings']),
              'imageTranscriptPages': ocr_pages, 'sourcePagesContainingOnlyPrintedMarkers': empty_markers,
              'pagesWithPreservedTableImages': tables, 'unusualCharacterPages': unusual, 'failures': failures,
              'scope': ['Original PDFs are copied byte for byte and checked with SHA-256.',
                        'Every native text span is retained exactly once with exact Unicode text and its original source ID.',
                        'Paragraph reflow adds whitespace between original lines; no native text is deleted or rewritten.',
                        'The search index contains every page, all native reading text, and reviewed image transcriptions.',
                        'Printed page lookup uses explicit centered page markers in the PDFs; source numbering is always available.',
                        'Automated text checks cannot prove visual reading order, table semantics, or original-source completeness.',
                        'All originals remain available for exact layout. Image transcripts have been visually reviewed.'],
              'pages': checked}
    (ROOT / 'reports').mkdir(exist_ok=True)
    (ROOT / 'reports' / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'reports' / 'validation.md').write_text(
        f'# Book preservation validation: {report["status"]}\n\n'
        f'- Original files verified: {len(book["files"])}\n- Pages verified: {len(checked):,}\n'
        f'- Native Unicode characters: {native_characters:,}\n- Native text spans verified: {native_spans:,}\n'
        f'- Chapter/section targets: {len(book["chapters"])}\n- Heading targets: {len(book["headings"]):,}\n'
        f'- Reviewed image-transcript pages: {ocr_pages}\n- Table illustration pages: {len(tables)}\n'
        f'- Replacement/null-character pages: {unusual}\n- Failures: {len(failures)}\n\n'
        '## What was checked\n\n' + '\n'.join('- ' + s for s in report['scope']) + '\n\n'
        '## Source observations\n\n'
        f'{len(empty_markers)} original pages contain only a printed page marker. These pages are retained, not dropped: '
        + ', '.join(map(str, empty_markers)) + '.\n\n'
        'Image text on the covers, publisher logos, and the two WHODAS forms is included as a separate, reviewed transcript. '
        'Table transcriptions use pipes for cell separators and underscores for blank fields; the image preserves exact relationships.\n\n'
        'Visual spot checks cover the cover/title pages, all sparse divider pages, the two scanned forms, narrative text, '
        'inline labels, diagnostic lists, native tables, chapter boundaries, appendix, and index. This is not a page-by-page human proofread.\n\n'
        + ('## Failures\n\n' + '\n'.join(failures) if failures else 'See `validation.json` for every page’s checksum and counts.\n'), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ['pages', 'scope', 'sourcePagesContainingOnlyPrintedMarkers', 'pagesWithPreservedTableImages']}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
