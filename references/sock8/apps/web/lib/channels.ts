'use client';

import { createProxyClient } from '@sock8/sdk/client';
import { type AppChannels } from './sock8';

// Let createProxyClient infer the specific client-side type
export const channels = createProxyClient<AppChannels>();
