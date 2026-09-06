import { cn } from '@[removed]/ui/lib/utils';
import * as React from 'react';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Slightly darker than background in light mode, lighter in dark mode
        'animate-pulse rounded-md bg-border/60 dark:bg-border/40',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
