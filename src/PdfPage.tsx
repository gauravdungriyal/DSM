import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ExternalLink, Minus, Plus } from 'lucide-react';
import { asset } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPage({ url, page, number }: { url: string; page: number; number: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setDoc(null); setError(''); setLoading(true);
    const task = pdfjs.getDocument({ url: asset(url) });
    task.promise.then(value => { if (active) setDoc(value); }).catch(reason => { if (active) { setError(String(reason)); setLoading(false); } });
    return () => { active = false; void task.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | undefined;
    setLoading(true); setError('');
    void (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.max(200, width - 4) / base.width * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const node = canvas.current;
        node.width = Math.floor(viewport.width * ratio);
        node.height = Math.floor(viewport.height * ratio);
        node.style.width = `${viewport.width}px`; node.style.height = `${viewport.height}px`;
        renderTask = pdfPage.render({ canvas: node, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
        await renderTask.promise;
        if (!cancelled) setLoading(false);
      } catch (reason) { if (!cancelled) { setError(String(reason)); setLoading(false); } }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [doc, page, width, zoom]);
  return <div className="pdf-view" ref={container}>
    <div className="pdf-tools"><span>Original page {number}</span><div className="button-row">
      <button className="icon-button" aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom(v => Math.max(.75, v - .25))}><Minus size={16} /></button>
      <span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(v => Math.min(3, v + .25))}><Plus size={16} /></button>
      <a className="icon-button" title="Open source PDF" aria-label="Open source PDF" target="_blank" rel="noreferrer" href={`${asset(url)}#page=${page}`}><ExternalLink size={16} /></a>
    </div></div>
    {loading && <p role="status" className="quiet-status">Rendering the original page…</p>}
    {error && <div className="error-box">This page could not be rendered. <a href={`${asset(url)}#page=${page}`} target="_blank" rel="noreferrer">Open the source PDF</a>.</div>}
    <div className="pdf-scroll"><canvas ref={canvas} aria-label={`Original source page ${number}. Switch to text view for accessible text.`} /></div>
  </div>;
}
