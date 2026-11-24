const hits = new Map<string, number[]>();

/** Small in-memory rate limit (per server instance). Returns true when the call is allowed. */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    });
  }
  return true;
}

export function clientIp(req: Request) {
  const f = req.headers.get('x-forwarded-for') || '';
  return f.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}
