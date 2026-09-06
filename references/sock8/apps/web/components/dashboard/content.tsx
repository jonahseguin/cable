'use client';

import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { ReactNode, Suspense } from 'react';
import { DashboardHeader } from './header';
import { DashboardMain } from './main';

interface DashboardContentProps {
  children: ReactNode;
}

export function DashboardContent({ children }: DashboardContentProps) {
  return (
    <div className="bg-background text-foreground flex h-full min-h-screen w-full">
      {/* Sidebar */}
      <DashboardSidebar />

      {/* Main content */}
      <div className="flex h-full min-h-screen w-full flex-col">
        <DashboardHeader />
        <DashboardMain>
          <Suspense fallback={<DashboardContentSkeleton />}>{children}</Suspense>
        </DashboardMain>
      </div>
    </div>
  );
}

const DashboardContentSkeleton = () => {
  return <></>;
};
