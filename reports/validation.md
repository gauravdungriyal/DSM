# Book preservation validation: PASS

- Original files verified: 12
- Pages verified: 1,377
- Native Unicode characters: 3,583,556
- Native text spans verified: 74,675
- Chapter/section targets: 47
- Heading targets: 2,562
- Reviewed image-transcript pages: [1, 2, 6, 1122, 1123]
- Table illustration pages: 11
- Replacement/null-character pages: []
- Failures: 0

## What was checked

- Original PDFs are copied byte for byte and checked with SHA-256.
- Every native text span is retained exactly once with exact Unicode text and its original source ID.
- Paragraph reflow adds whitespace between original lines; no native text is deleted or rewritten.
- The search index contains every page, all native reading text, and reviewed image transcriptions.
- Printed page lookup uses explicit centered page markers in the PDFs; source numbering is always available.
- Automated text checks cannot prove visual reading order, table semantics, or original-source completeness.
- All originals remain available for exact layout. Image transcripts have been visually reviewed.

## Source observations

33 original pages contain only a printed page marker. These pages are retained, not dropped: 123, 126, 128, 130, 207, 254, 301, 349, 407, 447, 490, 515, 543, 576, 586, 671, 712, 726, 753, 903, 979, 1035, 1064, 1068, 1084, 1104, 1107, 1124, 1145, 1167, 1198, 1227, 1251.

Image text on the covers, publisher logos, and the two WHODAS forms is included as a separate, reviewed transcript. Table transcriptions use pipes for cell separators and underscores for blank fields; the image preserves exact relationships.

Visual spot checks cover the cover/title pages, all sparse divider pages, the two scanned forms, narrative text, inline labels, diagnostic lists, native tables, chapter boundaries, appendix, and index. This is not a page-by-page human proofread.

See `validation.json` for every page’s checksum and counts.
