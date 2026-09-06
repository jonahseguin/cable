'use client';

import { TableRow, TableCell } from './table';
import { Skeleton } from './skeleton';
import React from 'react';

interface TableSkeletonRowProps {
  cols?: number;
}

export function TableSkeletonRow({ cols = 3 }: TableSkeletonRowProps) {
  return (
    <TableRow className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i} className="py-2.5">
          <Skeleton className="h-3 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}
