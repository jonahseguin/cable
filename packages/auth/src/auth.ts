import { db } from '@[removed]/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { getActiveOrganization } from './service/organization';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'mysql',
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const organization = await getActiveOrganization({ userId: session.userId });
          return {
            data: {
              ...session,
              activeOrganizationId: organization?.id,
            },
          };
        },
      },
    },
  },
  plugins: [
    organization({
      organizationLimit: 5,
      async sendInvitationEmail(data) {
        const domain = process.env.VERCEL_URL || 'local.[removed].com';
        const domainWithoutProtocol = domain?.replace(/^https?:\/\//, '');
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const inviteLink = `${protocol}://${domainWithoutProtocol}/invite/${data.id}`;

        // try and load the send invite fn
        const { sendInvitationEmail } = await import('@[removed]/web/lib/email-better-auth-utils');

        try {
          const email = await sendInvitationEmail({
            inviterName: data.inviter.user.name,
            inviterAvatar: data.inviter.user.image,
            inviterRole: data.inviter.role,
            inviteeEmail: data.email,
            teamName: data.organization.name,
            inviteLink,
          });
        } catch (error) {
          console.error('Failed to send invitation email:', error);
          // Re-throw the error so the caller knows it failed
          throw error;
        }
      },
      // Disable teams within organizations (we're treating orgs as teams)
      teams: {
        enabled: false,
      },
      // Allow users to create organizations freely
      allowUserToCreateOrganization: true,
    }),
  ],
});
