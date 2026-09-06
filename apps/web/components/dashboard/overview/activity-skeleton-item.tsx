'use client';

import React from 'react';
import { Skeleton } from '@sock8/ui/components/skeleton';

interface ActivitySkeletonItemProps {
  isFirst?: boolean;
  isLast?: boolean;
}

export function ActivitySkeletonItem({
  isFirst = false,
  isLast = false,
}: ActivitySkeletonItemProps) {
  return (
    <div className="relative px-4 py-2.5">
      {/* Timeline connector */}
      <div
        className={`bg-border/50 dark:bg-border/70 absolute left-8 -z-0 w-px ${
          isFirst ? 'top-1/2' : 'top-0'
        } ${isLast ? 'bottom-1/2' : 'bottom-0'}`}
      />

      {/* Icon skeleton - centered vertically */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <Skeleton className="relative z-10 h-8 w-8 rounded-md" />
      </div>

      <div className="flex flex-col gap-1.5 pl-12">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>

        {/* Content row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
