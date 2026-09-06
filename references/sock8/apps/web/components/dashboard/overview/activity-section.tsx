'use client';

import * as React from 'react';
import { ActivityRow, ActivityRowItem } from '@/components/dashboard/overview/activity-row';
import { ActivitySkeletonItem } from '@/components/dashboard/overview/activity-skeleton-item';
import { Card, CardContent } from '@sock8/ui/components/card';
import { Button } from '@sock8/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sock8/ui/components/tooltip';
import { ScrollArea } from '@sock8/ui/components/scroll-area';
import {
  List,
  Plug2,
  MessageSquare as MessageSquareIcon,
  AlertTriangle,
  Wifi,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@sock8/ui/lib/utils';
import Link from 'next/link';

export type ActivityFilter = 'all' | 'connects' | 'messages' | 'errors' | 'disconnects';

interface ActivitySectionProps {
  /** List of recent activities to display */
  items: ActivityRowItem[];
  /** Optional organization slug for click navigation */
  orgSlug?: string;
}

export function ActivitySection({ items, orgSlug }: ActivitySectionProps) {
  const [filter, setFilter] = React.useState<ActivityFilter>('all');

  const filtered = React.useMemo(() => {
    return items.filter((a) => {
      if (filter === 'all') return true;
      if (filter === 'connects') return a.type === 'connect';
      if (filter === 'disconnects') return a.type === 'disconnect';
      // for messages/errors, drop trailing 's'
      return a.type === filter.slice(0, -1);
    });
  }, [items, filter]);

  const filterButtons = [
    { key: 'all', icon: List, color: 'foreground', tooltip: 'All' },
    { key: 'connects', icon: Plug2, color: 'success', tooltip: 'Connects' },
    { key: 'messages', icon: MessageSquareIcon, color: 'primary', tooltip: 'Messages' },
    { key: 'errors', icon: AlertTriangle, color: 'destructive', tooltip: 'Errors' },
    { key: 'disconnects', icon: Wifi, color: 'accent-foreground', tooltip: 'Disconnects' },
  ] as const;

  const viewAllHref = orgSlug ? `/${orgSlug}/activity` : '/activity';

  return (
    <section className="lg:col-span-8">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-muted-foreground flex items-center text-sm font-medium">
          <List className="mr-1.5 h-4 w-4" />
          Recent Activity
        </h2>

        <div className="flex items-center gap-2">
          {/* Filter Buttons */}
          <div className="flex items-center gap-1">
            {filterButtons.map((btn) => {
              const isActive = filter === btn.key;
              const IconComp = btn.icon;
              return (
                <TooltipProvider key={btn.key} delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setFilter(btn.key)}
                        aria-label={btn.tooltip}
                        className={cn(
                          'border-border/40 flex h-7 w-7 items-center justify-center rounded-md border transition-all duration-200',
                          isActive
                            ? 'bg-background text-foreground scale-105 shadow-sm'
                            : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground hover:border-border/60',
                        )}
                        style={
                          isActive && btn.key !== 'all'
                            ? { color: `hsl(var(--${btn.color}))` }
                            : undefined
                        }
                      >
                        <IconComp className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{btn.tooltip}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="hover:bg-primary/5 hover:text-primary hover:border-primary/20 group h-7 px-3 py-1.5 text-xs font-medium transition-all duration-200"
            asChild
          >
            <Link href={viewAllHref}>
              View all
              <ArrowRight className="ml-1.5 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-border/40 bg-card/95 hover:border-border/60 hover:bg-card/100 animate-in fade-in slide-in-from-top-2 flex-col gap-0 pb-0 pt-0 shadow-none backdrop-blur-sm transition-all duration-200 hover:shadow-sm">
        <CardContent className="px-0 pt-0">
          <ScrollArea className="max-h-[420px] w-full pr-1">
            <div className="divide-border/10 relative flex flex-col">
              {filtered.length === 0 && <ActivitySkeletonItem isFirst isLast />}
              {filtered.map((item, idx) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === filtered.length - 1}
                  onClick={() => {
                    const href = orgSlug
                      ? `/${orgSlug}/activity/${item.id}`
                      : `/activity/${item.id}`;
                    window.location.href = href;
                  }}
                  className="hover:bg-secondary/40 cursor-pointer"
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  );
}
