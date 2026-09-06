import InviteFlowHandler from '@/components/invite/invite-flow-handler';
import { auth } from '@[removed]/auth';
import { headers } from 'next/headers';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headersList = await headers();

  const [session, invitation] = await Promise.all([
    auth.api.getSession({
      headers: headersList,
    }),
    auth.api.getInvitation({
      query: {
        id: token,
      },
      headers: headersList,
    }),
  ]);

  return <InviteFlowHandler invitation={invitation} session={session} token={token} />;
}

export type Invitation = Awaited<ReturnType<typeof auth.api.getInvitation>>;
