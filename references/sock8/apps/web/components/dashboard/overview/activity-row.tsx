'use client';

import * as React from 'react';
import { cn } from '@sock8/ui/lib/utils';
import { Circle, Globe, Hash } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@sock8/ui/components/avatar';
import { Badge } from '@sock8/ui/components/badge';

export interface ActivityRowItem {
  id: string | number;
  timestamp: string; // e.g. 10:32:14.123
  type: string; // connect, message, error, etc
  description: string;
  color: string; // tailwind color token, e.g. "primary" | "success"
  timeAgo?: string; // 2m ago, optional
  icon?: React.ReactNode;
  userData?: { name: string; image?: string } | null;
  details?: {
    channel?: string;
    region?: string;
    [key: string]: string | undefined;
  };
}

interface ActivityRowProps extends React.HTMLAttributes<HTMLDivElement> {
  item: ActivityRowItem;
  isFirst?: boolean;
  isLast?: boolean;
}

export const ActivityRow = React.forwardRef<HTMLDivElement, ActivityRowProps>(
  ({ item, className, isFirst = false, isLast = false, ...props }, ref) => {
    const { timestamp, type, description, color, timeAgo, icon, userData, details } = item;

    // Ensure readable color: for subtle tokens like accent or muted, use their foreground counterpart
    const displayColorToken = ['accent', 'muted', 'secondary'].includes(color)
      ? `${color}-foreground`
      : color;

    // Map types to more descriptive labels
    const typeLabels: Record<string, string> = {
      connect: 'CONNECT',
      message: 'MESSAGE',
      error: 'ERROR',
      disconnect: 'DISCONNECT',
    };

    const typeLabel = typeLabels[type.toLowerCase()] || type.toUpperCase();

    // Extract basic description without details
    const baseDescription = description
      .replace(/["']([^"']+)["']|(?:to|from) ([a-zA-Z0-9\-_.]+)/g, '')
      .trim();

    return (
      <div
        ref={ref}
        className={cn(
          'animate-in fade-in group relative w-full overflow-hidden px-4 py-2.5 transition-colors duration-200',
          className,
        )}
        title={description}
        {...props}
      >
        {/* Timeline connector - extends before and after the icon */}
        <div
          className={cn(
            'bg-border/50 dark:bg-border/70 absolute left-8 -z-0 w-px',
            isFirst ? 'top-1/2' : 'top-0',
            isLast ? 'bottom-1/2' : 'bottom-0',
          )}
        />

        {/* Icon badge - positioned to span both rows */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <Badge
            variant="outline"
            className="bg-background z-10 flex h-8 w-8 items-center justify-center backdrop-blur-sm transition-all duration-200 group-hover:scale-105"
            style={{
              borderColor: `hsl(var(--${displayColorToken}))/0.3`,
              color: `hsl(var(--${displayColorToken}))`,
            }}
          >
            {React.cloneElement((icon as any) ?? <Circle />, {
              className: cn('h-3.5 w-3.5', (icon as any)?.props?.className),
              strokeWidth: (icon as any)?.props?.strokeWidth ?? 1.5,
            })}
          </Badge>
        </div>

        <div className="flex flex-col pl-12">
          {/* Header row with type, timestamp and time ago */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="flex items-center text-xs font-medium"
                style={{ color: `hsl(var(--${displayColorToken}))` }}
              >
                {typeLabel}
              </span>
              <span className="text-muted-foreground/70 font-mono text-xs">{timestamp}</span>
            </div>

            {/* Time ago */}
            {timeAgo && (
              <span className="text-muted-foreground bg-muted/30 shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs tabular-nums">
                {timeAgo}
              </span>
            )}
          </div>

          {/* Content row with description and pills */}
          <div className="flex items-center justify-between gap-2">
            {/* Description */}
            <span className="flex-1 truncate text-sm">{baseDescription}</span>

            {/* Pills container - right aligned */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {/* Channel pill */}
              {details?.channel && (
                <Badge
                  variant="outline"
                  className="bg-primary/5 border-primary/20 text-primary flex h-5 items-center gap-1 px-1.5 py-0.5 font-mono text-xs"
                >
                  <Hash className="h-3 w-3" />
                  {details.channel}
                </Badge>
              )}

              {/* Region pill - only for connection events */}
              {details?.region && ['connect', 'disconnect'].includes(type.toLowerCase()) && (
                <Badge
                  variant="outline"
                  className="bg-muted/30 border-border/30 text-foreground/90 flex h-5 items-center gap-1 px-1.5 py-0.5 text-xs"
                >
                  <Globe className="h-3 w-3" />
                  {details.region}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
ActivityRow.displayName = 'ActivityRow';
