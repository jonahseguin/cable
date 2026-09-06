import { Providers } from '@/components/providers';
import { Toaster } from '@sock8/ui/components/sonner';
import '@sock8/ui/styles/globals.css';
import { Analytics } from '@vercel/analytics/next';
import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata, Viewport } from 'next';
import type React from 'react';

export const metadata: Metadata = {
  title: 'sock8 - Type-safe realtime for Next.js',
  description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
  icons: {
    icon: 'https://sock8.com/logo.png',
  },
  openGraph: {
    title: 'sock8 - Type-safe realtime for Next.js',
    images: [{ url: 'https://sock8.com/sock8-hero-v2.png', width: 3024, height: 1868 }],
    locale: 'en_US',
    type: 'website',
    siteName: 'sock8',
    url: 'https://sock8.com',
    emails: ['hello@sock8.com'],
    description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
  },
  twitter: {
    title: 'sock8 - Type-safe realtime for Next.js',
    description: 'End-to-end type-safe realtime platform for the Next.js ecosystem.',
    images: [{ url: 'https://sock8.com/sock8-hero-v2.png', width: 3024, height: 1868 }],
    site: 'https://sock8.com',
    card: 'summary_large_image',
  },
  applicationName: 'sock8',
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    'sock8',
    'sock-8',
    'sock8.com',
    'usesock8',
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
      name: 'sock8',
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
