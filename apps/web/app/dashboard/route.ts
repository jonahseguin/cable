import { auth } from '@[removed]/auth';
import { getActiveOrganization } from '@[removed]/auth';
import { db } from '@[removed]/db';
import { eq, and } from 'drizzle-orm';
import { organization as organizationTable, member as memberTable } from '@[removed]/db/schema';
import { redirect } from 'next/navigation';

export async function GET(request: Request) {
  const session = (await auth.api.getSession({ headers: request.headers }))!;
  const activeOrganizationId = session?.session.activeOrganizationId;

  let organization;
  if (!activeOrganizationId) {
    organization = await getActiveOrganization({ userId: session.session.userId });
  } else {
    organization = await db.query.organization.findFirst({
      where: eq(organizationTable.id, activeOrganizationId),
    });
  }

  if (!organization) {
    return redirect('/onboarding');
  }

  // assert that the session user is a member of the organization
  const member = await db.query.member.findFirst({
    where: and(
      eq(memberTable.userId, session.session.userId),
      eq(memberTable.organizationId, organization.id),
    ),
  });

  if (!member) {
    return new Response(JSON.stringify({ error: 'User is not a member of the organization' }), {
      status: 403,
    });
  }

  if (!activeOrganizationId) {
    await auth.api.setActiveOrganization({
      headers: request.headers,
      body: {
        organizationId: organization.id,
      },
    });
  }

  return redirect(`/${organization.slug}`);
}
