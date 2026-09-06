'use server';

import { auth } from '@sock8/auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import {
  teamDataSchema,
  profileDataSchema,
  TeamData,
  ProfileData,
  TeamSetupResponse,
} from '../../components/onboarding/schemas';

/**
 * Completes the team setup as part of onboarding.
 * Creates an organization, updates user profile, and sends invitations to team members.
 */
export async function completeTeamSetup(
  teamData: TeamData,
  profileData: ProfileData,
): Promise<TeamSetupResponse> {
  // Validate input
  const validatedTeam = teamDataSchema.parse(teamData);
  const validatedProfile = profileDataSchema.parse(profileData);

  // Get the current user session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('You must be logged in to complete the onboarding process');
  }

  const userHeaders = await headers();

  // Update the user profile if needed
  if (
    validatedProfile.name !== session.user.name ||
    validatedProfile.picture !== session.user.image
  ) {
    await auth.api.updateUser({
      headers: userHeaders,
      body: {
        name: validatedProfile.name,
        image: validatedProfile.picture || undefined,
      },
    });
  }

  const orgName = validatedTeam.name || `${validatedProfile.name}'s Team`;
  const organization = await auth.api.createOrganization({
    headers: userHeaders,
    body: {
      name: orgName,
      slug: orgName
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^a-z0-9-]/g, ''),
      userId: session.user.id,
      // Use the team picture for organization logo if available
      logo: validatedTeam.picture ?? validatedProfile.picture ?? undefined,
    },
  });

  // Set this as the active organization
  await auth.api.setActiveOrganization({
    headers: userHeaders,
    body: {
      organizationId: organization!.id,
    },
  });

  // Process team members (except the current user who is automatically added as owner)
  const currentUserEmail = session.user.email;
  const membersToInvite = validatedTeam.members.filter(
    (member) => member.email !== currentUserEmail,
  );

  // Send invitations to all team members
  const invitePromises = membersToInvite.map((member) =>
    auth.api.createInvitation({
      headers: userHeaders,
      body: {
        email: member.email,
        role: member.role,
        organizationId: organization!.id,
      },
    }),
  );

  // Wait for all invitations to be sent
  await Promise.all(invitePromises);

  // Update paths that might rely on this data
  revalidatePath('/dashboard');

  // Redirect to dashboard
  return { success: true, organizationId: organization!.id };
}
