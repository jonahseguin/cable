import { sendEmail } from './email-server-utils';
import invite from '@/components/email/template/invite';

export const sendInvitationEmail = async ({
  inviterName,
  inviterAvatar,
  inviterRole,
  inviteeEmail,
  teamName,
  inviteLink,
}: {
  inviterName: string;
  inviterAvatar?: string | null;
  inviterRole: string;
  inviteeEmail: string;
  teamName: string;
  inviteLink: string;
}): Promise<any | null> =>
  sendEmail({
    email: invite,
    props: {
      inviterName,
      inviterAvatar,
      role: inviterRole,
      inviteeEmail,
      teamName,
      inviteLink,
    },
    to: inviteeEmail,
  });
