"""Build the reading edition without discarding any native text span.

Original PDFs and raw page text are retained. Reader order uses coordinates;
span IDs retain the original extraction order for independent verification.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'book'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def block_text(block):
    return ''.join(s['t'] for s in block['spans'])


def get_blocks(page):
    blocks = []
    span_id = 0
    # TEXTFLAGS_TEXT matches the canonical native-text extraction flags.
    for bi, block in enumerate(page.get_text('dict', flags=pymupdf.TEXTFLAGS_TEXT)['blocks']):
        if block['type'] != 0:
            continue
        spans = []
        sizes = []
        fonts = []
        for li, line in enumerate(block['lines']):
            if li:
                spans.append({'t': ' '})
            for span in line['spans']:
                spans.append({'t': span['text'], 'id': span_id,
                              'b': bool(span['flags'] & 16), 'i': bool(span['flags'] & 2),
                              's': bool(span['flags'] & 1)})
                span_id += 1
                if span['text'].strip():
                    sizes.extend([span['size']] * len(span['text']))
                    fonts.append(span['font'])
        text = ''.join(s['t'] for s in spans)
        rect = block['bbox']
        size = sorted(sizes)[len(sizes) // 2] if sizes else 12
        centered = abs((rect[0] + rect[2]) / 2 - page.rect.width / 2) < 5
        marker = bool(re.fullmatch(r'(?:\d{1,4}|[ivxlcdm]+)', text.strip())) and centered and 11.5 <= size <= 12.5
        kind = 'marker' if marker else 'paragraph'
        if not marker and any('Sans' in f for f in fonts) and size >= 13:
            kind = 'heading'
        blocks.append({'id': f'b{bi}', 'kind': kind, 'spans': spans,
                       'level': 2 if size >= 19 else 3 if size >= 16 else 4,
                       'bbox': [round(x, 2) for x in rect],
                       'firstLineX': round(block['lines'][0]['bbox'][0], 2),
                       'indent': round(max(0, min(60, rect[0] - 72))),
                       'small': size < 10})
    blocks.sort(key=lambda b: (b['bbox'][1], b['bbox'][0]))
    # PDF producers often store small bold run-in labels separately.
    merged = []
    for block in blocks:
        if merged:
            prev = merged[-1]
            same_line = abs(prev['bbox'][1] - block['bbox'][1]) < 3
            if (same_line and prev['kind'] == block['kind'] == 'paragraph'
                    and prev['bbox'][2] <= block['firstLineX'] + 2
                    and prev['bbox'][3] - prev['bbox'][1] < 18):
                prev['spans'] += [{'t': ' '}] + block['spans']
                prev['bbox'] = [min(prev['bbox'][0], block['bbox'][0]), min(prev['bbox'][1], block['bbox'][1]),
                                max(prev['bbox'][2], block['bbox'][2]), max(prev['bbox'][3], block['bbox'][3])]
                prev['small'] = prev['small'] and block['small']
                continue
        merged.append(block)
    return merged


def main():
    for folder in ['pages', 'originals', 'raw', 'images']:
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    paths = sorted((ROOT / 'book-parts').glob('*.pdf'), key=lambda p: int(re.search(r'-(\d+)-(\d+)\.pdf$', p.name)[1]))
    files, chapters, pages, headings, search = [], [], [], [], []
    expected = 1
    ocr_engine = None
    reviewed_path = ROOT / 'scripts' / 'ocr-reviewed.json'
    reviewed = json.loads(reviewed_path.read_text(encoding='utf-8')) if reviewed_path.exists() else {}
    for fi, path in enumerate(paths):
        start, end = map(int, re.search(r'-(\d+)-(\d+)\.pdf$', path.name).groups())
        assert start == expected, f'Gap or overlap before {path.name}'
        doc = pymupdf.open(path)
        assert len(doc) == end - start + 1, f'Page count differs from filename: {path.name}'
        expected = end + 1
        file_data = path.read_bytes()
        shutil.copyfile(path, OUT / 'originals' / path.name)
        files.append({'name': path.name, 'start': start, 'end': end, 'pages': len(doc),
                      'sha256': sha(file_data), 'bytes': len(file_data), 'url': 'book/originals/' + path.name})
        for level, title, local in doc.get_toc():
            if local > 0:
                chapters.append({'title': title.replace('\u00a0', ' '), 'level': level, 'page': start + local - 1})
        for pi, page in enumerate(doc):
            num = start + pi
            raw = page.get_text('text', flags=pymupdf.TEXTFLAGS_TEXT)
            (OUT / 'raw' / f'{num}.txt').write_text(raw, encoding='utf-8', newline='')
            blocks = get_blocks(page)
            markers = [block_text(b).strip() for b in blocks if b['kind'] == 'marker']
            figures = []
            # Every raster image is exported losslessly through a PNG page crop.
            for ii, img in enumerate(page.get_image_info()):
                rect = pymupdf.Rect(img['bbox']) & page.rect
                if rect.is_empty:
                    continue
                name = f'{num}-image-{ii}.png'
                page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=rect).save(OUT / 'images' / name)
                figures.append({'url': f'book/images/{name}', 'bbox': list(rect), 'kind': 'image'})
            table_count = 0
            if len(page.get_drawings()) >= 8:
                tables = page.find_tables().tables
                for ti, table in enumerate(tables):
                    if table.row_count < 2 or table.col_count < 2:
                        continue
                    rect = pymupdf.Rect(table.bbox)
                    name = f'{num}-table-{ti}.png'
                    page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=rect + (-2, -2, 2, 2)).save(OUT / 'images' / name)
                    figures.append({'url': f'book/images/{name}', 'bbox': list(rect), 'kind': 'table'})
                    table_count += 1
            ocr = None
            # Image-only pages require an additional searchable transcript.
            if figures and (len(raw.strip()) < 40 or str(num) in reviewed):
                digest = sha(file_data)
                if str(num) in reviewed and reviewed[str(num)]['sourceSha256'] == digest:
                    ocr = reviewed[str(num)]
                else:
                    cached = ROOT / '.work' / f'ocr-{num}.json'
                    if cached.exists():
                        lines = json.loads(cached.read_text(encoding='utf-8'))
                    else:
                        from rapidocr_onnxruntime import RapidOCR
                        import numpy as np
                        ocr_engine = ocr_engine or RapidOCR()
                        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                        array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                        result, _ = ocr_engine(array)
                        lines = [{'text': r[1], 'confidence': float(r[2])} for r in (result or [])]
                    ocr = {'text': '\n'.join(line['text'] for line in lines), 'reviewed': False,
                           'sourceSha256': digest,
                           'lowConfidenceLines': [line['text'] for line in lines if line['confidence'] < .90]}
            # Keep native paragraphs as the primary reading content. Put source
            # table illustrations alongside them, never replacing extracted spans.
            native_reading = '\n\n'.join(block_text(b) for b in blocks)
            record = {'number': num, 'file': fi, 'localPage': pi + 1, 'markers': markers,
                      'blocks': blocks, 'figures': figures, 'ocr': ocr,
                      'nativeTextSha256': sha(raw.encode('utf-8')),
                      'nativeCharacters': len(raw), 'sparse': len(raw.strip()) < 40,
                      'tableCount': table_count}
            write_json(OUT / 'pages' / f'{num}.json', record)
            pages.append({k: record[k] for k in ['number', 'file', 'localPage', 'markers', 'nativeCharacters', 'sparse', 'tableCount']})
            pages[-1]['hasImages'] = bool(figures)
            pages[-1]['hasOcr'] = bool(ocr)
            for block in blocks:
                if block['kind'] == 'heading':
                    headings.append({'page': num, 'block': block['id'], 'title': block_text(block), 'level': block['level']})
            search.append({'page': num, 'text': native_reading + ('\n' + ocr['text'] if ocr else '')})
        print(f'Extracted {path.name}: {len(doc)} pages', flush=True)
    chapters.insert(0, {'title': 'Front cover', 'level': 1, 'page': 1})
    for ci, chapter in enumerate(chapters):
        chapter['id'] = f'chapter-{ci + 1}'
        chapter['end'] = chapters[ci + 1]['page'] - 1 if ci + 1 < len(chapters) else len(pages)
        chapter['group'] = ('Front matter' if chapter['page'] < 92 else
                            'I · DSM-5 Basics' if chapter['page'] < 126 else
                            'II · Diagnostic Criteria and Codes' if chapter['page'] < 1104 else
                            'III · Emerging Measures and Models' if chapter['page'] < 1197 else
                            'Appendix & index')
    for entry in search:
        chapter = next(c for c in reversed(chapters) if c['page'] <= entry['page'])
        entry['chapter'] = chapter['title']
    book = {'title': 'Diagnostic and Statistical Manual of Mental Disorders', 'shortTitle': 'DSM-5-TR',
            'edition': 'Fifth Edition · Text Revision', 'year': 2022, 'totalPages': len(pages),
            'files': files, 'chapters': chapters, 'pages': pages, 'headings': headings,
            'nativeCharacters': sum(p['nativeCharacters'] for p in pages)}
    write_json(OUT / 'manifest.json', book)
    write_json(OUT / 'search.json', search)
    print(f'Complete: {len(pages)} pages, {len(headings)} headings, {len(chapters)} chapters/sections.', flush=True)


if __name__ == '__main__':
    main()
