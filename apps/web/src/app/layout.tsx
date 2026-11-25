import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: { default: 'CoWork AI — Your AI co-worker for WhatsApp & Telegram', template: '%s · CoWork AI' },
  metadataBase: new URL('https://coworkai.zenautomations.in'),
  description:
    'CoWork AI answers your customers on WhatsApp and Telegram 24×7 — books appointments, captures leads and knows your business. Made in India.',
  openGraph: {
    title: 'CoWork AI',
    description: 'Your AI co-worker for WhatsApp & Telegram',
    url: 'https://coworkai.zenautomations.in',
    siteName: 'CoWork AI',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5faf6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1510' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
