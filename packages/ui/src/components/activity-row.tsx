import * as React from 'react';
import { cn } from '@[removed]/ui/lib/utils';
import { Circle, Globe, Hash } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { Badge } from './badge';

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
          'group w-full overflow-hidden px-4 py-2.5 transition-colors duration-200 relative animate-in fade-in',
          className,
        )}
        title={description}
        {...props}
      >
        {/* Timeline connector - extends before and after the icon */}
        <div
          className={cn(
            'absolute left-8 w-px bg-border/50 dark:bg-border/70 -z-0',
            isFirst ? 'top-1/2' : 'top-0',
            isLast ? 'bottom-1/2' : 'bottom-0',
          )}
        />

        {/* Icon badge - positioned to span both rows */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <Badge
            variant="outline"
            className="bg-background backdrop-blur-sm h-8 w-8 flex items-center justify-center transition-all duration-200 group-hover:scale-105 z-10"
            style={{
              borderColor: `hsl(var(--${displayColorToken}))/0.3`,
              color: `hsl(var(--${displayColorToken}))`,
            }}
          >
            {React.cloneElement(
              (icon as any) ?? <Circle />, // fallback circle
              {
                className: cn('h-3.5 w-3.5', (icon as any)?.props?.className),
                strokeWidth: (icon as any)?.props?.strokeWidth ?? 1.5,
              },
            )}
          </Badge>
        </div>

        <div className="flex flex-col pl-12">
          {/* Header row with type, timestamp and time ago */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-medium flex items-center"
                style={{ color: `hsl(var(--${displayColorToken}))` }}
              >
                {typeLabel}
              </span>
              <span className="font-mono text-xs text-muted-foreground/70">{timestamp}</span>
            </div>

            {/* Time ago */}
            {timeAgo && (
              <span className="whitespace-nowrap tabular-nums text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded shrink-0">
                {timeAgo}
              </span>
            )}
          </div>

          {/* Content row with description and pills */}
          <div className="flex items-center gap-2 justify-between">
            {/* Description */}
            <span className="text-sm truncate flex-1">{baseDescription}</span>

            {/* Pills container - right aligned */}
            <div className="flex flex-wrap gap-1.5 items-center shrink-0">
              {/* Channel pill */}
              {details?.channel && (
                <Badge
                  variant="outline"
                  className="bg-primary/5 border-primary/20 text-primary font-mono text-xs px-1.5 py-0.5 h-5 flex items-center gap-1"
                >
                  <Hash className="h-3 w-3" />
                  {details.channel}
                </Badge>
              )}

              {/* Region pill - only for connection events */}
              {details?.region && ['connect', 'disconnect'].includes(type.toLowerCase()) && (
                <Badge
                  variant="outline"
                  className="bg-muted/30 border-border/30 text-foreground/90 text-xs px-1.5 py-0.5 h-5 flex items-center gap-1"
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
