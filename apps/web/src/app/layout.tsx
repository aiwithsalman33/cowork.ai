import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: { default: 'CoworkAI — Your AI co-worker for WhatsApp & Telegram', template: '%s · CoworkAI' },
  metadataBase: new URL('https://coworkai.axxeler.in'),
  description:
    'CoworkAI answers your customers on WhatsApp and Telegram 24×7 — books appointments, captures leads and knows your business. Made in India.',
  openGraph: {
    title: 'CoworkAI',
    description: 'Your AI co-worker for WhatsApp & Telegram',
    url: 'https://coworkai.axxeler.in',
    siteName: 'CoworkAI',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1714' },
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
