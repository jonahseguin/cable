'use client';

import { create } from 'zustand';
import { z } from 'zod';

export const TIME_RANGE_LITERALS = ['24h', '7d', '30d'] as const;
export const timeRangeEnum = z.enum(TIME_RANGE_LITERALS);

export const timeRangeSchema = z.union([
  timeRangeEnum,
  z.object({
    from: z.date(),
    to: z.date(),
  }),
]);

export type TimeRange = z.infer<typeof timeRangeSchema>;

interface AnalyticsStoreState {
  showTimeFilter: boolean;
  timeRange: TimeRange;
  timeRangeLabel: string;
  setTimeRange: (timeRange: TimeRange) => void;
  setShowTimeFilter: (showTimeFilter: boolean) => void;
}

const literalTimeRangeLabels: Record<(typeof TIME_RANGE_LITERALS)[number], string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export const useAnalytics = create<AnalyticsStoreState>((set, get) => ({
  showTimeFilter: false,
  timeRange: '24h',
  timeRangeLabel: '24h',
  setTimeRange: (timeRange: TimeRange) => {
    set({ timeRange });
    if (typeof timeRange === 'object') {
      set({
        timeRangeLabel: `${timeRange.from.toLocaleDateString()} - ${timeRange.to.toLocaleDateString()}`,
      });
    } else if (typeof timeRange === 'string') {
      set({
        timeRangeLabel: literalTimeRangeLabels[timeRange],
      });
    }
  },
  setShowTimeFilter: (showTimeFilter: boolean) => {
    set({ showTimeFilter });
  },
}));
