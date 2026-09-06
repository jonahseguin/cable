'use client';

import { Button } from '@sock8/ui/components/button';
import { Separator } from '@sock8/ui/components/separator';
import { useSidebar } from '@sock8/ui/components/sidebar';
import { cn } from '@sock8/ui/lib/utils';
import { ChevronRight, PanelLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { TeamSwitcher } from './team-switcher';
import { UserActions } from './user-actions';
import AnalyticsTimeFilter from '@/analytics/components/analytics-time-filter';

export function DashboardHeader() {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();

  // build breadcrumb from pathname (ignore first slash and org slug)
  const crumbs = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    // remove org slug if exists (first segment)
    return segments.slice(1).map((seg) => {
      const clean = seg.replace(/-/g, ' ');
      const words = clean.split(' ');
      return words
        .map((word) => (word === 'api' ? 'API' : word))
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    });
  }, [pathname]);

  // time range pills
  type Range = '24h' | '7d' | '30d';
  const [range, setRange] = React.useState<Range>('24h');

  return (
    <header className="border-border/50 bg-sidebar/95 sticky top-0 z-20 flex h-12 items-center gap-4 border-b px-4 backdrop-blur-xl">
      {/* sidebar trigger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="text-muted-foreground hover:text-primary hover:bg-primary/5 h-8 w-8 rounded-md p-0 md:hidden"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <div className="hidden md:block">
        <TeamSwitcher />
      </div>

      {/* Breadcrumb (desktop) */}
      <nav className="text-muted-foreground hidden min-w-0 items-center gap-1 text-xs font-medium md:flex">
        <Link href="/" className="hover:text-foreground truncate">
          Dashboard
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1 truncate">
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground/80 truncate">{c}</span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <AnalyticsTimeFilter />

      {/* Search icon (placeholder) */}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-primary hover:bg-primary/5 h-8 w-8 rounded-md"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* Time range pills */}

      {/* user actions (theme, bell, avatar) */}
      <UserActions />
    </header>
  );
}
