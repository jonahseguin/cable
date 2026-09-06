'use server';

import { auth } from '@[removed]/auth';
import { headers } from 'next/headers';
import { db } from '@[removed]/db';
import { eq } from 'drizzle-orm';
import { organization as organizationTable } from '@[removed]/db/schema';

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
