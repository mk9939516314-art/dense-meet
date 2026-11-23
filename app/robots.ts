import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // Meeting rooms are private links; only the landing page should be indexed.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/'] } };
}
