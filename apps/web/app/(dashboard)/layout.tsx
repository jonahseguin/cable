import { ReactNode } from 'react';
import { SidebarProvider } from '@[removed]/ui/components/sidebar';
import { DashboardContent } from '@/components/dashboard/content';
import { [removed]Provider } from '@[removed]/next/client';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <[removed]Provider>
      <SidebarProvider defaultOpen={true}>
        <DashboardContent>{children}</DashboardContent>
      </SidebarProvider>
    </[removed]Provider>
  );
}
