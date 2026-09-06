import { SettingsSidebar } from '@/components/dashboard/settings';
import { ReactNode } from 'react';

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const baseUrl = `/${org}/settings`;

  return (
    <div className="relative mx-auto p-6">
      <div className="relative">
        <div className="flex flex-col items-start gap-6 md:flex-row">
          {/* Navigation sidebar */}
          <SettingsSidebar baseUrl={baseUrl} />

          {/* Main content */}
          <main className="flex-1 md:max-w-full">{children}</main>
        </div>
      </div>
    </div>
  );
}
