import type { Metadata, Viewport } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import './globals.css';

const display = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Dense Meet', template: '%s | Dense Meet' },
  description: 'Video meetings with a star-field view, live AI notes, interview scorecards and a Host Copilot. By Dense AI.',
  applicationName: 'Dense Meet',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Dense Meet', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/favicon-64.png', sizes: '64x64', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-icon.png' },
  openGraph: {
    title: 'Dense Meet',
    description: 'Meetings that listen, think and help.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0B0F',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
