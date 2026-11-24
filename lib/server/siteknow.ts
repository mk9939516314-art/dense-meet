/** Reads the public Dense AI website so the chatbot answers from what is really published there. Cached for 15 minutes. */
const SITE = (process.env.DENSE_SITE_URL || 'https://dense-ai.vercel.app').trim().replace(/\/$/, '');
const PAGES = ['/', '/about', '/services', '/workforce', '/quality', '/contact', '/faq'];

let cache: { at: number; text: string; chars: number } | null = null;
let inflight: Promise<void> | null = null;

function strip(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/section|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function page(path: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(SITE + path, { signal: ctl.signal, headers: { 'User-Agent': 'DenseMeetBot/1.0' } });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/html|text/.test(ct)) return '';
    return strip(await res.text()).slice(0, 3500);
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

async function refresh() {
  const parts = await Promise.all(PAGES.map(async (p) => ({ p, t: await page(p) })));
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const { p, t } of parts) {
    if (t.length < 80 || seen.has(t.slice(0, 120))) continue;
    seen.add(t.slice(0, 120));
    blocks.push(`[${SITE}${p}]\n${t}`);
  }
  const text = blocks.join('\n\n').slice(0, 9000);
  cache = { at: Date.now(), text, chars: text.length };
}

/** Never makes the chat wait long: if the cache is cold it waits up to 1.5 s, then answers with what it has. */
export async function siteKnowledge() {
  if (!cache || Date.now() - cache.at > 15 * 60_000) {
    inflight ||= refresh().finally(() => {
      inflight = null;
    });
    await Promise.race([inflight, new Promise((r) => setTimeout(r, cache ? 0 : 1500))]);
  }
  return cache?.text || '';
}

export const siteStatus = () => ({ site: SITE, chars: cache?.chars || 0, at: cache?.at || 0 });
