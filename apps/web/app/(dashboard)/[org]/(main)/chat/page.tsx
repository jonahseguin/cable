'use client';

import { ChatComponent } from '@/components/dashboard/ChatComponent';

export default function DashboardPage() {
  // const session = authClient.useSession();
  // const name = session?.data?.user.name;
  // const firstName = name?.split(' ')?.[0] ?? name;
  // const org = authClient.useActiveOrganization();

  return (
    <div className="p-6">
      <ChatComponent />
    </div>
  );
}
