import 'server-only';

import { edgeConfigAdapter } from '@flags-sdk/edge-config';
import { flag } from 'flags/next';

export const waitlistEnabledFlag = flag<boolean>({
  adapter: edgeConfigAdapter(),
  key: 'waitlist',
  defaultValue: true,
});

export const displayWaitlistCountFlag = flag<boolean>({
  adapter: edgeConfigAdapter(),
  key: 'display-waitlist-count',
  defaultValue: false,
});

export const displayWailistRecentUsersFlag = flag<boolean>({
  adapter: edgeConfigAdapter(),
  key: 'display-waitlist-recent-users',
  defaultValue: false,
});

export const allowLoginFlag = flag<boolean>({
  adapter: edgeConfigAdapter(),
  key: 'allow-login',
  defaultValue: false,
});

export const precomputeFlags = [
  waitlistEnabledFlag,
  displayWaitlistCountFlag,
  displayWailistRecentUsersFlag,
  allowLoginFlag,
] as const;
