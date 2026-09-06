import { withVercelToolbar } from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@[removed]/ui', '@[removed]/auth'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    ppr: 'incremental',
  },
};

export default withVercelToolbar()(nextConfig);
