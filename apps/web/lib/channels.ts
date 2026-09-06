'use client';

import { createProxyClient } from '@[removed]/sdk/client';
import { type AppChannels } from './[removed]';

// Let createProxyClient infer the specific client-side type
export const channels = createProxyClient<AppChannels>();
