'use server';

import { Cloudflare } from 'cloudflare';

export const getCloudflareClient = async () => {
  return {
    client: new Cloudflare({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    }),
    account_id: process.env.CLOUDFLARE_ACCOUNT_ID!,
  };
};
