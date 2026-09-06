import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@[removed]/ui/components/card';
import { TableSkeletonRow } from '@[removed]/ui/components/table-skeleton-row';
import { Badge } from '@[removed]/ui/components/badge';
import { Button } from '@[removed]/ui/components/button';
import { cn } from '@[removed]/ui/lib/utils';
import { Network, Users, MessageSquare as MessageSquareIcon, ArrowRight } from 'lucide-react';

export interface TopChannel {
  id: string;
  subscribers: number;
  messages_1h: number;
}

interface TopChannelsSectionProps {
  /** List of channels to display */
  channels: TopChannel[];
  /** Optional organization slug for building links */
  orgSlug?: string;
}

export function TopChannelsSection({ channels, orgSlug }: TopChannelsSectionProps) {
  const sorted = React.useMemo(
    () => [...channels].sort((a, b) => b.messages_1h - a.messages_1h),
    [channels],
  );

  const viewAllHref = orgSlug ? `/${orgSlug}/channels` : '/channels';

  return (
    <section className="lg:col-span-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-muted-foreground flex items-center text-sm font-medium">
          <Network className="mr-1.5 h-4 w-4" />
          Top Channels
        </h2>
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

      <Card className="border-border/40 bg-card/95 hover:border-border/60 hover:bg-card/100 animate-in fade-in slide-in-from-top-2 gap-4 pb-0 pt-0 shadow-none backdrop-blur-sm transition-all duration-200 hover:shadow-sm">
        <CardContent className="p-0">
          <div className="divide-border/10 flex flex-col divide-y">
            {sorted.length === 0 && <TableSkeletonRow cols={3} />}
            {sorted.map((channel, idx) => {
              const rowColor =
                channel.messages_1h > 1000
                  ? 'primary' // very high traffic
                  : channel.messages_1h > 100
                    ? 'warning' // moderate traffic
                    : 'accent'; // low traffic subtle but visible
              const channelHref = orgSlug
                ? `/${orgSlug}/channels/${channel.id}`
                : `/channels/${channel.id}`;

              return (
                <Link
                  key={channel.id}
                  href={channelHref}
                  className={cn(
                    'hover:bg-secondary/60 group flex items-center gap-3 px-5 py-3 transition-all duration-200',
                    idx === 0 && 'first:rounded-tl-sm',
                  )}
                  style={{ borderLeft: `2px solid hsl(var(--${rowColor}))` }}
                >
                  <Badge
                    variant="outline"
                    className="border-border/50 bg-background/40 group-hover:border-border/80 group-hover:bg-secondary/60 flex h-8 w-8 items-center justify-center backdrop-blur-sm transition-all duration-200"
                    style={{ color: `hsl(var(--${rowColor}))` }}
                  >
                    <MessageSquareIcon className="h-4 w-4" />
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium leading-none group-hover:underline">
                      {channel.id}
                    </p>
                    <div className="text-muted-foreground mt-1.5 flex items-center gap-8 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Users className="text-muted-foreground h-3.5 w-3.5" />
                        <span className="bg-muted/30 rounded px-1.5 py-0.5 font-medium tabular-nums">
                          {channel.subscribers}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageSquareIcon className="text-muted-foreground h-3.5 w-3.5" />
                        <span className="bg-muted/30 rounded px-1.5 py-0.5 font-medium tabular-nums">
                          {channel.messages_1h}
                        </span>
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
