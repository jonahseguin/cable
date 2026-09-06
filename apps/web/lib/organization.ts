'use server';

import { auth } from '@sock8/auth';
import { headers } from 'next/headers';
import { db } from '@sock8/db';
import { eq } from 'drizzle-orm';
import { organization as organizationTable } from '@sock8/db/schema';

export async function getActiveOrganization() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !session.session.activeOrganizationId) {
    return null;
  }

  const org = await db.query.organization.findFirst({
    where: eq(organizationTable.id, session.session.activeOrganizationId),
  });

  return org;
}
