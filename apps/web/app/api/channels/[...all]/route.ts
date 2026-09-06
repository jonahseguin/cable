import { sock8, channels } from '@sock8/web/lib/sock8';
import { withSock8 } from '@sock8/next/server';
import { auth } from '@sock8/auth';
import { headers } from 'next/headers';

export const { POST, GET } = withSock8(sock8, {
  authorize: async (conn) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    conn.identifyAs(session.user.id);

    if (session.session.activeOrganizationId) {
      conn.grant(channels.chat.global.msgs);
    }
  },
});
