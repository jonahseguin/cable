import { Providers } from '@/components/providers';
import { Toaster } from '@[removed]/ui/components/sonner';
import '@[removed]/ui/styles/globals.css';
import { Analytics } from '@vercel/analytics/next';
import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata, Viewport } from 'next';
import type React from 'react';

export const metadata: Metadata = {
  title: '[removed] - Type-safe realtime for Next.js',
  description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
  icons: {
    icon: 'https://[removed].com/logo.png',
  },
  openGraph: {
    title: '[removed] - Type-safe realtime for Next.js',
    images: [{ url: 'https://[removed].com/[removed]-hero-v2.png', width: 3024, height: 1868 }],
    locale: 'en_US',
    type: 'website',
    siteName: '[removed]',
    url: 'https://[removed].com',
    emails: ['hello@[removed].com'],
    description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
  },
  twitter: {
    title: '[removed] - Type-safe realtime for Next.js',
    description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
    images: [{ url: 'https://[removed].com/[removed]-hero-v2.png', width: 3024, height: 1868 }],
    site: 'https://[removed].com',
    card: 'summary_large_image',
  },
  applicationName: '[removed]',
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    '[removed]',
    'sock-8',
    '[removed].com',
    'use[removed]',
    'websocket',
    'websockets',
    'nextjs',
    'next.js',
    'next',
    'react.js',
    'react',
    'reactjs',
    'typescript',
    'zod',
    'type safe',
    'type-safe',
    'type-safety',
    'serverless',
    'server-less',
    'websockets as a service',
    'service',
    'infrastructure',
    'socket',
    'realtime',
    'real-time',
    'edge',
    'edge native',
    'serverless websockets',
    'realtime as a service',
    'cloudflare',
  ],
  authors: [
    {
      name: '[removed]',
      url: 'https://github.com/sock-8',
    },
    {
      name: 'bizarre',
      url: 'https://github.com/bizarre',
    },
    {
      name: 'Jonah Seguin',
      url: 'https://github.com/jonahseguin',
    },
  ],
  category: 'developer tools',
  verification: {
    google: 'm9frnP8cIDdaD-ALab6dMEbgcudXAqQuZcL4-stJWCQ',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 2,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === 'production';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="overscroll-none">
        <Providers>
          {children}
          <Analytics />
          <Toaster />
        </Providers>
        {!isProduction && <VercelToolbar />}
      </body>
    </html>
  );
}
