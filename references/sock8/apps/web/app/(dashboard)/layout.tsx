import { ReactNode } from 'react';
import { SidebarProvider } from '@sock8/ui/components/sidebar';
import { DashboardContent } from '@/components/dashboard/content';
import { Sock8Provider } from '@sock8/next/client';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Sock8Provider>
      <SidebarProvider defaultOpen={true}>
        <DashboardContent>{children}</DashboardContent>
      </SidebarProvider>
    </Sock8Provider>
  );
}
