import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Home, List, Menu, Moon, Search, Settings2, Sun, X } from 'lucide-react';
import { asset, blockText, chapterAt, navigate, readStored, routeTo, saveStored, type Block, type Book, type BookPage, type Chapter, type Position, type SearchResult, type Settings } from './types';

const PdfPage = lazy(() => import('./PdfPage'));
const defaultSettings: Settings = { theme: 'light', size: 18, width: 'standard' };
const groups = ['Front matter', 'I · DSM-5 Basics', 'II · Diagnostic Criteria and Codes', 'III · Emerging Measures and Models', 'Appendix & index'];
const pageCache = new Map<number, Promise<BookPage>>();
async function loadPage(number: number) {
  if (!pageCache.has(number)) pageCache.set(number, fetch(asset(`book/pages/${number}.json`)).then(r => {
    if (!r.ok) throw new Error(`Page ${number} could not be loaded.`);
    return r.json() as Promise<BookPage>;
  }).catch(error => { pageCache.delete(number); throw error; }));
  return pageCache.get(number)!;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{text}</>;
  const expression = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(expression).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>;
}

function Modal({ title, close, children, className = '' }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`modal ${className}`} onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function SearchDialog({ book, close }: { book: Book; close: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(40);
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (event: MessageEvent<{ id: number; results: SearchResult[]; total: number; error?: string }>) => {
      if (event.data.id !== request.current) return;
      setLoading(false); setError(event.data.error || '');
      setResults(event.data.results || []); setTotal(event.data.total || 0);
    };
    w.onerror = () => { setLoading(false); setError('Search could not start. Close this window and try again.'); };
    return () => { w.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    const id = ++request.current;
    setError('');
    if (!query.trim()) { setResults([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => worker.current?.postMessage({ id, query, limit, url: asset('book/search.json') }), 180);
    return () => clearTimeout(timer);
  }, [query, limit]);
  return <Modal title="Search the book" close={close} className="search-modal">
    <div className="search-input-wrap"><Search size={21} /><input autoFocus aria-label="Search the entire book" placeholder="A topic, diagnosis, code, or phrase…" value={query} onChange={e => { setQuery(e.target.value); setLimit(40); }} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</div>
    <div className="search-meta" role="status">{loading ? 'Searching all 1,377 pages…' : query.trim() ? `${total.toLocaleString()} matching pages` : 'Search every chapter, reference, and image transcription.'}<span>ESC to close</span></div>
    <div className="search-results">
      {error ? <p className="error-box">{error}</p> : !query.trim() ? <div className="search-empty"><BookOpen size={32} /><h3>Find your place in the manual.</h3><p>Try a diagnosis, an ICD-10-CM code, or a topic.</p><div className="suggestions">{['Neurodevelopmental', 'F90.2', 'WHODAS'].map(term => <button key={term} onClick={() => setQuery(term)}>{term}</button>)}</div></div> : !loading && !results.length ? <div className="search-empty"><Search size={30} /><h3>No matching pages</h3><p>Try fewer words or a different spelling.</p></div> : results.map(result => <a key={result.page} className="search-result" href={routeTo(result.page, { q: query })} onClick={close}><div><strong>{result.chapter}</strong><span>Source {result.page}{book.pages[result.page - 1].markers.length ? ` · Print ${book.pages[result.page - 1].markers.join(', ')}` : ''}</span></div><p><Highlight text={result.snippet} query={query} /></p><ArrowRight size={17} /></a>)}
      {results.length < total && !loading && <button className="secondary-button load-results" onClick={() => setLimit(v => v + 60)}>Show more results</button>}
    </div>
  </Modal>;
}

function Sidebar({ book, active, isHome, open, close, search }: { book: Book; active: Chapter; isHome: boolean; open: boolean; close: () => void; search: () => void }) {
  const [expanded, setExpanded] = useState<string[]>(['II · Diagnostic Criteria and Codes']);
  const [filter, setFilter] = useState('');
  useEffect(() => { if (!isHome) setExpanded(v => v.includes(active.group) ? v : [...v, active.group]); }, [active.group, isHome]);
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={close} />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Book navigation">
      <a href="#/" className="brand" onClick={close}><span className="brand-icon"><BookOpen size={23} strokeWidth={1.5} /></span><span>the reading room<span className="brand-subtitle">A LITTLE SPACE TO UNDERSTAND</span></span></a>
      <div className="sidebar-book"><span className="edition-tag">THE MANUAL</span><h2>DSM-5-TR<span>2022</span></h2><p>Fifth Edition · Text Revision</p></div>
      <button className="sidebar-search" onClick={() => { close(); search(); }}><Search size={17} /><span>Search the book</span><kbd>⌘ K</kbd></button>
      <a href="#/" className={`overview-link ${isHome ? 'active' : ''}`} onClick={close}><Home size={17} />Book overview</a>
      <div className="contents-label"><span>CONTENTS</span><span>{book.chapters.length}</span></div>
      <label className="chapter-filter"><List size={14} /><input aria-label="Filter chapters" placeholder="Find a chapter…" value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <nav className="chapter-nav">
        {groups.map(group => {
          const chapters = book.chapters.filter(c => c.group === group && c.title.toLowerCase().includes(filter.toLowerCase()));
          if (!chapters.length) return null;
          const isExpanded = !!filter || expanded.includes(group);
          return <div className="chapter-group" key={group}><button className="group-toggle" aria-expanded={isExpanded} onClick={() => setExpanded(v => v.includes(group) ? v.filter(g => g !== group) : [...v, group])}><span>{group}</span><ChevronDown size={14} className={isExpanded ? 'rotated' : ''} /></button>
            {isExpanded && <div className="chapter-links">{chapters.map(c => <a key={c.id} href={routeTo(c.page)} onClick={close} aria-current={!isHome && active.id === c.id ? 'page' : undefined} className={!isHome && active.id === c.id ? 'active' : ''}><span>{c.title.replace(/^Section\s+(?:III|II|I)\s+/, '')}</span><span className="nav-page">{c.page}</span></a>)}</div>}
          </div>;
        })}
        {filter && !book.chapters.some(c => c.title.toLowerCase().includes(filter.toLowerCase())) && <p className="no-chapters">No chapters match.</p>}
      </nav>
      <div className="sidebar-foot"><span className="status-dot" /><span>The complete reading edition</span><span className="sidebar-page-count">1,377 source pages</span></div>
    </aside>
  </>;
}

function HomePage({ book, search }: { book: Book; search: () => void }) {
  const position = readStored<Position | null>('dsm-position', null);
  const last = position && position.page >= 1 && position.page <= book.totalPages ? position : null;
  const lastChapter = last ? chapterAt(book, last.page) : null;
  return <main id="main-content" tabIndex={-1} className="home-main">
    <div className="home-eyebrow"><span className="small-line" /> YOUR PERSONAL REFERENCE LIBRARY</div>
    <section className="hero">
      <div className="hero-copy"><span className="pill"><span className="status-dot" /> FIFTH EDITION · TEXT REVISION</span><h1>DSM-5-TR<span>Diagnostic and Statistical Manual of Mental Disorders</span></h1><p className="hero-description">The complete manual, thoughtfully arranged for reading, searching, and finding your way.</p><p className="publisher">American Psychiatric Association <span>·</span> 2022</p><div className="hero-actions"><a className="primary-button" href={routeTo(last?.page ?? 35, last ? { resume: '1' } : {})}>{last ? 'Continue reading' : 'Start reading'}<ArrowRight size={17} /></a><button className="text-button" onClick={search}><Search size={17} />Search the manual</button></div></div>
      <div className="cover-stage"><div className="cover-orbit" /><img className="book-cover" src={asset('book/images/1-image-0.png')} alt="DSM-5-TR, Fifth Edition, Text Revision book cover" /><span className="cover-caption">A familiar reference. A new reading experience.</span></div>
    </section>
    <div className="book-facts"><div><span className="fact-number">1,377</span><span>source pages</span></div><div><span className="fact-number">47</span><span>chapters & sections</span></div><div><span className="fact-number">12</span><span>parts, one book</span></div><div className="fact-note"><BookOpen size={21} strokeWidth={1.3} /><span>Readable text.<br />Original pages always close.</span></div></div>
    {last && lastChapter && <a className="resume-card" href={routeTo(last.page, { resume: '1' })}><div className="resume-icon"><BookOpen size={21} /></div><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h3>{lastChapter.title}</h3><p>Source page {last.page} of {book.totalPages}</p></div><ArrowRight size={20} /></a>}
    <section className="explore"><div className="section-heading"><div><span className="eyebrow">A MAP OF THE MANUAL</span><h2>Explore the book</h2></div><a className="text-button" href={routeTo(8)}>Full contents<ArrowRight size={16} /></a></div><div className="section-cards">
      {[{ roman: 'I', title: 'DSM-5 Basics', desc: 'Introduction, use of the manual, and the foundations of diagnosis.', page: 92, count: '3 chapters' }, { roman: 'II', title: 'Diagnostic Criteria & Codes', desc: 'The diagnostic classification, criteria, and accompanying text.', page: 126, count: '22 chapters' }, { roman: 'III', title: 'Emerging Measures & Models', desc: 'Assessment measures, cultural context, and areas for further study.', page: 1104, count: '4 chapters' }].map(section => <a className="section-card" key={section.roman} href={routeTo(section.page)}><div className="card-top"><span className="roman">{section.roman}</span><ArrowRight size={19} /></div><h3>{section.title}</h3><p>{section.desc}</p><span className="card-meta">{section.count}<span>Source p. {section.page}</span></span></a>)}
    </div></section>
    <section className="quick-links"><a href={routeTo(41)}><FileText size={19} /><span>DSM-5-TR Classification</span><ChevronRight size={17} /></a><a href={routeTo(1197)}><List size={19} /><span>Appendix & code listings</span><ChevronRight size={17} /></a><a href={routeTo(1307)}><Search size={19} /><span>Alphabetical index</span><ChevronRight size={17} /></a></section>
    <footer className="home-footer"><span>Made for focused reading.</span><span>DSM-5-TR · American Psychiatric Association · 2022</span></footer>
  </main>;
}

function TextBlock({ block, number, query }: { block: Block; number: number; query: string }) {
  const contents = block.spans.map((span, i) => <span key={i} data-span={span.id} className={`${span.b ? 'bold' : ''} ${span.i ? 'italic' : ''} ${span.s ? 'superscript' : ''}`}><Highlight text={span.t} query={query} /></span>);
  const id = `page-${number}-${block.id}`;
  if (block.kind === 'marker') return <div id={id} className="printed-marker" title="Printed page marker from the source"><span>{contents}</span></div>;
  if (block.kind === 'heading') {
    const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
    return <Tag id={id} className="book-heading"><a className="heading-anchor" href={routeTo(number, { block: block.id })} aria-label={`Link to ${blockText(block)}`}>#</a>{contents}</Tag>;
  }
  return <p id={id} className={`book-paragraph ${block.small ? 'small-print' : ''}`} style={{ '--indent': `${block.indent / 3}px` } as CSSProperties}>{contents}</p>;
}

function PageText({ page, book, query }: { page: BookPage; book: Book; query: string }) {
  const chapter = book.chapters.find(c => c.page === page.number);
  return <article className="book-page" id={`source-page-${page.number}`} data-page={page.number}>
    <div className="page-divider"><span>SOURCE PAGE {page.number}</span><a href={routeTo(page.number, { view: 'original' })}><FileText size={13} />View original</a></div>
    {chapter && <div className="chapter-start"><span className="eyebrow">{chapter.group}</span><h2>{chapter.title}</h2></div>}
    {page.figures.filter(f => f.kind === 'image').map((figure, i) => <figure key={i} className={`source-figure ${page.number < 3 ? 'cover-figure' : ''}`}><a href={asset(figure.url)} target="_blank" rel="noreferrer" title="Open image at full size"><img loading="lazy" src={asset(figure.url)} alt={`Original ${page.number < 3 ? 'cover' : page.number >= 1122 && page.number <= 1123 ? 'WHODAS 2.0 assessment form' : 'illustration'} from source page ${page.number}`} /></a><figcaption>Original illustration · <a href={asset(figure.url)} target="_blank" rel="noreferrer">Open full size</a></figcaption></figure>)}
    {page.figures.some(f => f.kind === 'table') && <details className="table-layout" open><summary><FileText size={16} />Original table layout <span>Text follows below</span></summary>{page.figures.filter(f => f.kind === 'table').map((figure, i) => <a key={i} href={asset(figure.url)} target="_blank" rel="noreferrer"><img loading="lazy" src={asset(figure.url)} alt={`Original table ${i + 1} on source page ${page.number}. Extracted text follows below.`} /></a>)}</details>}
    <div className="native-content">{page.blocks.map(block => <TextBlock key={block.id} block={block} number={page.number} query={query} />)}</div>
    {page.sparse && !page.figures.length && <p className="divider-note">This source page contains only a printed page marker.</p>}
    {page.ocr && <details className="image-transcript" open><summary>Read image text <span>{page.ocr.reviewed ? 'Checked against the original' : 'OCR transcription'}</span></summary><div className="transcript-text"><Highlight text={page.ocr.text} query={query} /></div></details>}
  </article>;
}

function Reader({ book, start, params, settings, onPage }: { book: Book; start: number; params: URLSearchParams; settings: Settings; onPage: (page: number) => void }) {
  const [pages, setPages] = useState<BookPage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(start);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const [jump, setJump] = useState(String(start));
  const [jumpType, setJumpType] = useState('source');
  const [jumpError, setJumpError] = useState('');
  const [showOutline, setShowOutline] = useState(false);
  const initialRestore = useRef(true);
  const busy = useRef(false);
  const alive = useRef(true);
  const trackedHash = useRef(location.hash);
  const tail = useRef<HTMLDivElement>(null);
  const original = params.get('view') === 'original';
  const query = params.get('q') || '';
  const block = params.get('block');
  const chapter = chapterAt(book, active);
  const meta = book.pages[active - 1];
  const headings = useMemo(() => book.headings.filter(h => h.page >= chapter.page && h.page <= chapter.end && h.level <= 3), [book, chapter]);
  const percent = Math.round((active - 1) / (book.totalPages - 1) * 100);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all(Array.from({ length: Math.min(3, book.totalPages - start + 1) }, (_, i) => loadPage(start + i))).then(data => {
      if (cancelled) return;
      setPages(data); setLoading(false);
    }).catch(reason => { if (!cancelled) { setError(String(reason)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [start, book.totalPages, retry]);
  useEffect(() => {
    if (!pages.length || !initialRestore.current) return;
    initialRestore.current = false;
    const timer = setTimeout(() => {
      if (block) document.getElementById(`page-${start}-${block}`)?.scrollIntoView({ block: 'start' });
      else if (params.get('resume')) {
        const saved = readStored<Position | null>('dsm-position', null);
        const node = document.getElementById(`source-page-${start}`);
        if (saved?.page === start && node) window.scrollTo(0, node.offsetTop + saved.offset);
      } else window.scrollTo(0, 0);
    }, 80);
    return () => clearTimeout(timer);
  }, [pages, block, start, params]);
  useEffect(() => {
    if (original) { onPage(start); saveStored('dsm-position', { page: start, offset: 0, updated: Date.now() }); return; }
    let ticking = false;
    let frame = 0;
    const update = () => {
      ticking = false;
      // A link may have changed the hash before its hashchange event is handled.
      // Never let a pending scroll callback overwrite that navigation.
      if (!alive.current || location.hash !== trackedHash.current) return;
      const nodes = [...document.querySelectorAll<HTMLElement>('.book-page')];
      const current = nodes.find(node => node.getBoundingClientRect().bottom > 190) ?? nodes.at(-1);
      if (!current) return;
      const num = Number(current.dataset.page);
      setActive(num); onPage(num);
      saveStored('dsm-position', { page: num, offset: window.scrollY - current.offsetTop, updated: Date.now() });
      // Updating the permalink while scrolling must not reload the reader.
      const nextHash = routeTo(num, { ...(query ? { q: query } : {}), ...(block && num === start ? { block } : {}) });
      history.replaceState(null, '', nextHash);
      trackedHash.current = nextHash;
    };
    const scroll = () => { if (!ticking) { ticking = true; frame = requestAnimationFrame(update); } };
    window.addEventListener('scroll', scroll, { passive: true });
    const timer = setTimeout(update, 250);
    return () => { window.removeEventListener('scroll', scroll); clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [pages, original, start, onPage, query, block]);
  const loadMore = useCallback(async () => {
    const next = (pages.at(-1)?.number ?? start - 1) + 1;
    if (busy.current || next > book.totalPages) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const more = await Promise.all(Array.from({ length: Math.min(3, book.totalPages - next + 1) }, (_, i) => loadPage(next + i)));
      if (alive.current) setPages(existing => [...existing, ...more]);
    } catch (reason) { if (alive.current) setError(String(reason)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }, [pages, start, book.totalPages]);
  useEffect(() => {
    if (!tail.current || loading || error || original || !pages.length) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) void loadMore(); }, { rootMargin: '400px' });
    observer.observe(tail.current);
    return () => observer.disconnect();
  }, [loadMore, loading, error, original, pages.length]);
  useEffect(() => { setJump(String(active)); }, [active]);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(routeTo(active, original ? { view: 'original' } : {}), location.href).href);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { setJumpError('Copy the page link from your browser’s address bar.'); }
  };
  const doJump = (event: React.FormEvent) => {
    event.preventDefault(); setJumpError('');
    if (jumpType === 'source') {
      const num = Number(jump);
      if (!Number.isInteger(num) || num < 1 || num > book.totalPages) { setJumpError(`Enter a source page from 1 to ${book.totalPages}.`); return; }
      navigate(routeTo(num, original ? { view: 'original' } : {}));
    } else {
      const target = book.pages.find(p => p.markers.some(m => m.toLowerCase() === jump.trim().toLowerCase()));
      if (!target) { setJumpError('That printed page marker was not found. Try a source page instead.'); return; }
      navigate(routeTo(target.number, original ? { view: 'original' } : {}));
    }
  };
  const chapterIndex = book.chapters.findIndex(c => c.id === chapter.id);
  return <main id="main-content" tabIndex={-1} className={`reader-main ${settings.width === 'wide' ? 'wide-reader' : ''}`} style={{ '--reading-size': `${settings.size}px` } as CSSProperties}>
    <div className="reader-toolbar"><div className="view-switch" aria-label="Reading view"><button className={!original ? 'selected' : ''} aria-pressed={!original} onClick={() => navigate(routeTo(active, query ? { q: query } : {}))}><BookOpen size={16} />Text</button><button className={original ? 'selected' : ''} aria-pressed={original} onClick={() => navigate(routeTo(active, { view: 'original' }))}><FileText size={16} />Original page</button></div><div className="button-row"><button className="icon-button" onClick={copyLink} aria-label="Copy page link" title="Copy page link">{copied ? <Check size={18} /> : <Copy size={18} />}</button><button className={`icon-button ${showOutline ? 'selected' : ''}`} onClick={() => setShowOutline(v => !v)} aria-label="Toggle section outline" title="Section outline"><List size={20} /></button></div></div>
    <div className="reader-heading"><a href="#/" className="back-link"><ArrowLeft size={14} />The manual</a><div className="eyebrow">{chapter.group}</div><h1>{chapter.title}</h1><div className="reader-description"><span>Source page {active} of {book.totalPages}</span>{meta.markers.length > 0 && <><span className="dot">·</span><span>Printed {meta.markers.join(', ')}</span></>}<span className="dot">·</span><span>{percent}% through the book</span></div></div>
    <form className="page-jump" onSubmit={doJump}><label htmlFor="page-input">Go to</label><select aria-label="Page numbering" value={jumpType} onChange={e => setJumpType(e.target.value)}><option value="source">Source page</option><option value="printed">Printed page</option></select><input id="page-input" aria-label="Page number" value={jump} onChange={e => setJump(e.target.value)} inputMode={jumpType === 'source' ? 'numeric' : 'text'} /><button type="submit" className="icon-button" aria-label="Go to page"><ArrowRight size={17} /></button><span className="jump-hint">Source pages follow the order of your PDFs.</span></form>
    {jumpError && <p role="alert" className="inline-error">{jumpError}</p>}
    {query && <div className="search-context"><Search size={15} />Matches for “{query}”<button className="text-button" onClick={() => navigate(routeTo(active))}>Clear<X size={14} /></button></div>}
    {showOutline && <div className="outline-panel"><div className="eyebrow">IN THIS CHAPTER</div>{headings.length ? headings.map(h => <a key={`${h.page}-${h.block}`} href={routeTo(h.page, { block: h.block })} onClick={() => setShowOutline(false)}><span>{h.title}</span><span>{h.page}</span></a>) : <p>No subsection headings on these pages. Use the chapter list to continue.</p>}</div>}
    {original ? <Suspense fallback={<p className="quiet-status">Opening the original page…</p>}><PdfPage url={book.files[meta.file].url} page={meta.localPage} number={active} /></Suspense> : <div className="reading-text">{pages.map(page => <PageText key={page.number} page={page} book={book} query={query} />)}{loading && <p className="quiet-status" role="status">Loading the next pages…</p>}{error && <div className="error-box" role="alert">{error}<button className="secondary-button" onClick={() => pages.length ? void loadMore() : setRetry(v => v + 1)}>Try again</button></div>}{pages.length > 0 && pages.at(-1)!.number < book.totalPages && <div className="load-more" ref={tail}><button className="text-button" disabled={loading} onClick={() => void loadMore()}>Continue reading<ArrowDown size={16} /></button><span>Pages flow across all twelve parts.</span></div>}{pages.at(-1)?.number === book.totalPages && <div className="book-end"><BookOpen size={24} /><h3>You’ve reached the end of the book.</h3><a href="#/">Back to the overview</a></div>}</div>}
    <div className="reader-bottom"><div className="reading-progress" style={{ width: `${percent}%` }} /><div className="bottom-inner"><button className="text-button" disabled={active <= 1} onClick={() => navigate(routeTo(active - 1, original ? { view: 'original' } : {}))}><ChevronLeft size={17} /><span>Previous page</span></button><span className="bottom-page">{active.toLocaleString()} <span>/ {book.totalPages.toLocaleString()}</span></span><button className="text-button" disabled={active >= book.totalPages} onClick={() => navigate(routeTo(active + 1, original ? { view: 'original' } : {}))}><span>Next page</span><ChevronRight size={17} /></button></div><div className="chapter-step"><button disabled={chapterIndex === 0} onClick={() => navigate(routeTo(book.chapters[chapterIndex - 1].page))}>Previous section</button><span>{chapter.title}</span><button disabled={chapterIndex === book.chapters.length - 1} onClick={() => navigate(routeTo(book.chapters[chapterIndex + 1].page))}>Next section</button></div></div>
  </main>;
}

export default function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  const [hash, setHash] = useState(location.hash);
  const [routeVersion, setRouteVersion] = useState(0);
  const [active, setActive] = useState(() => Number(location.hash.match(/^#\/read\/(\d+)/)?.[1]) || 1);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = readStored<Partial<Settings>>('dsm-settings', defaultSettings);
    return { theme: saved.theme === 'dark' ? 'dark' : 'light', size: typeof saved.size === 'number' ? Math.max(15, Math.min(25, saved.size)) : 18, width: saved.width === 'wide' ? 'wide' : 'standard' };
  });
  useEffect(() => {
    fetch(asset('book/manifest.json')).then(r => { if (!r.ok) throw new Error('Book content is unavailable. Run npm run extract, then reload.'); return r.json(); }).then(setBook).catch(reason => setError(String(reason)));
    const change = () => { setHash(location.hash); setRouteVersion(v => v + 1); setMenu(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable);
      if ((event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) { event.preventDefault(); setSearch(v => !v); }
      if (event.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; saveStored('dsm-settings', settings); }, [settings]);
  const route = hash.match(/^#\/read\/(\d+)(?:\?(.*))?$/);
  const start = route && book ? Math.max(1, Math.min(book.totalPages, Number(route[1]))) : 1;
  const params = useMemo(() => new URLSearchParams(route?.[2] || ''), [route?.[2]]);
  const isHome = !route;
  useEffect(() => { setActive(start); }, [start, routeVersion]);
  useEffect(() => { document.title = book && !isHome ? `${chapterAt(book, active).title} · DSM-5-TR` : 'DSM-5-TR · The Reading Room'; }, [book, active, isHome]);
  const onPage = useCallback((page: number) => setActive(page), []);
  if (error) return <div className="boot-screen error-box"><BookOpen size={40} /><h1>The book couldn’t be opened.</h1><p>{error}</p><button className="primary-button" onClick={() => location.reload()}>Reload</button></div>;
  if (!book) return <div className="boot-screen" role="status"><BookOpen size={42} strokeWidth={1.3} /><h1>Opening the reading room…</h1></div>;
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView(); }}>Skip to reading</a>
    <Sidebar book={book} active={chapterAt(book, active)} isHome={isHome} open={menu} close={() => setMenu(false)} search={() => setSearch(true)} />
    <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMenu(v => !v)} aria-label="Toggle navigation" aria-expanded={menu}><Menu size={21} /></button><span className="topbar-library">THE LIBRARY</span><ChevronRight size={13} /><a href="#/">DSM-5-TR</a><span className="topbar-edition">Reading edition</span></div><div className="topbar-actions"><button className="icon-button" onClick={() => setSearch(true)} aria-label="Search book" title="Search (Ctrl K)"><Search size={19} /></button><button className="icon-button" onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))} aria-label={settings.theme === 'light' ? 'Use dark mode' : 'Use light mode'} title="Change theme">{settings.theme === 'light' ? <Moon size={18} /> : <Sun size={19} />}</button><span className="topbar-separator" /><button className="settings-button" aria-label="Reading settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>Reading settings</span></button></div></header>
    {isHome ? <HomePage book={book} search={() => setSearch(true)} /> : <Reader key={`${routeVersion}-${start}`} book={book} start={start} params={params} settings={settings} onPage={onPage} />}</div>
    {search && <SearchDialog book={book} close={() => setSearch(false)} />}
    {settingsOpen && <Modal title="Make yourself comfortable" close={() => setSettingsOpen(false)} className="settings-modal"><p className="settings-intro">Your reading preferences stay in this browser.</p><div className="setting"><label htmlFor="font-size">Text size <span>{settings.size}px</span></label><div className="range-control"><span>A</span><input id="font-size" type="range" min="15" max="25" value={settings.size} onChange={e => setSettings(s => ({ ...s, size: Number(e.target.value) }))} /><span>A</span></div></div><div className="setting"><span className="setting-label">Reading width</span><div className="setting-options">{(['standard', 'wide'] as const).map(width => <button key={width} aria-pressed={settings.width === width} className={settings.width === width ? 'selected' : ''} onClick={() => setSettings(s => ({ ...s, width }))}>{width === 'standard' ? 'Focused' : 'Spacious'}</button>)}</div></div><div className="setting"><span className="setting-label">Appearance</span><div className="setting-options"><button aria-pressed={settings.theme === 'light'} className={settings.theme === 'light' ? 'selected' : ''} onClick={() => setSettings(s => ({ ...s, theme: 'light' }))}><Sun size={18} />Daylight</button><button aria-pressed={settings.theme === 'dark'} className={settings.theme === 'dark' ? 'selected' : ''} onClick={() => setSettings(s => ({ ...s, theme: 'dark' }))}><Moon size={18} />Evening</button></div></div><div className="settings-preview" style={{ fontSize: settings.size }}>A little more space.<br />A little more clarity.</div><button className="text-button reset-settings" onClick={() => setSettings(defaultSettings)}>Reset to defaults</button></Modal>}
  </div>;
}
