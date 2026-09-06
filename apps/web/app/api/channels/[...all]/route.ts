import { [removed], channels } from '@[removed]/web/lib/[removed]';
import { with[removed] } from '@[removed]/next/server';
import { auth } from '@[removed]/auth';
import { headers } from 'next/headers';

export const { POST, GET } = with[removed]([removed], {
  authorize: async (conn) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    conn.identifyAs(session.user.id);

    if (session.session.activeOrganizationId) {
      conn.grant(channels.chat.global.msgs);
    }
  },
});
