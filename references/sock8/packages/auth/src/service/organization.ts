import { db } from '@sock8/db';
import { member, organization } from '@sock8/db/schema';
import { eq } from 'drizzle-orm';

export async function getActiveOrganization({
  userId,
}: {
  userId: string;
}): Promise<typeof organization.$inferSelect | undefined> {
  /**
   * Gets an organization to use as the active organization for a new session.
   *
   * It will give preference to organizations where the user is an admin.
   * If no such organization is found, it will return the first organization
   * where the user is a member.
   */

  const results = await db
    .select({
      organization: organization,
      member: member,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));

  // Sort results to prioritize admin role, then take the first one
  results.sort((a, b) => {
    if (a.member.role === 'admin' && b.member.role !== 'admin') {
      return -1; // a comes first
    }
    if (a.member.role !== 'admin' && b.member.role === 'admin') {
      return 1; // b comes first
    }
    return 0; // maintain original order otherwise
  });

  return results[0]?.organization;
}
