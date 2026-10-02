type Entry = { page: number; chapter: string; text: string; normalized?: string };
let entries: Entry[] | null = null;
let pending: Promise<void> | null = null;
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/-\s+/g, '').replace(/[\s\u00a0]+/g, ' ');
self.onmessage = async (event: MessageEvent<{ id: number; query: string; url: string; limit: number }>) => {
  const { id, query, url, limit } = event.data;
  try {
    if (!entries) {
      if (!pending) pending = fetch(url).then(async response => {
        if (!response.ok) throw new Error('The search index could not be loaded.');
        entries = (await response.json()) as Entry[];
        for (const entry of entries) entry.normalized = normalize(entry.text);
      }).catch(error => { pending = null; throw error; });
      await pending;
    }
    const phrase = normalize(query).trim();
    const tokens = phrase.split(/\s+/).filter(Boolean);
    if (!tokens.length) { self.postMessage({ id, results: [], total: 0 }); return; }
    const results = [];
    for (const entry of entries!) {
      if (!tokens.every(t => entry.normalized!.includes(t))) continue;
      const title = normalize(entry.chapter);
      const rawIndex = entry.text.toLowerCase().indexOf(tokens[0]);
      const start = Math.max(0, rawIndex - 90);
      results.push({ page: entry.page, chapter: entry.chapter,
        snippet: (start ? '…' : '') + entry.text.slice(start, start + 290).replace(/\s+/g, ' ') + (entry.text.length > start + 290 ? '…' : ''),
        score: (title.includes(phrase) ? 20 : 0) + (entry.normalized!.includes(phrase) ? 10 : 0) });
    }
    results.sort((a, b) => b.score - a.score || a.page - b.page);
    self.postMessage({ id, results: results.slice(0, limit), total: results.length });
  } catch (error) { self.postMessage({ id, error: String(error) }); }
};
