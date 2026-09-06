'use server';

import { ApiKey, auth } from '@[removed]/auth';
import { headers } from 'next/headers';

// Get the organization's API key
export async function getOrganizationApiKey(organizationId: string) {
  if (!organizationId) return null;
  const result = await ApiKey.getDefaultByOrganization(organizationId);

  const last6 = await ApiKey.getDescriptedKeyLast6(result?.key || '');
  const createdAt = result?.createdAt;

  return {
    apiKeyLast6: last6,
    apiKeyCreatedAt: createdAt,
  };
}

// Regenerate an API key
export async function regenerateApiKey(organizationId: string) {
  if (!organizationId) return null;

  const member = await auth.api.getActiveMember({
    headers: await headers(),
  });

  if (!member) return null;
  if (member.organizationId !== organizationId) return null;
  if (member.role !== 'admin' && member.role !== 'owner') return null;

  return await ApiKey.refreshDefaultByOrganization(organizationId);
}
