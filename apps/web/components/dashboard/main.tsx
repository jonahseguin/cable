import { ReactNode } from 'react';

export function DashboardMain({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex-1">
      <div className="fixed inset-0 left-0 top-0 z-0 -ml-1 w-full bg-transparent bg-[radial-gradient(theme(colors.foreground),transparent_1px)] bg-[size:24px_24px] opacity-30" />
      <div className="relative z-10 mx-auto max-w-7xl flex-1 space-y-6">{children}</div>
    </main>
  );
}
