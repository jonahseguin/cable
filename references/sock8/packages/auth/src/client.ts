import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Add the organization client plugin to enable organization-related functionality
  plugins: [organizationClient()],
});
