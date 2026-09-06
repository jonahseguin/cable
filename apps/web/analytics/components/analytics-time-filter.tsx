import { Button } from '@[removed]/ui/components';
import { useAnalytics, type TimeRange, timeRangeSchema, TIME_RANGE_LITERALS } from './store';
import { z } from 'zod';
import { cn } from '@[removed]/ui/lib/utils';

export default function AnalyticsTimeFilter({
  allowCustomRange = true,
}: {
  allowCustomRange?: boolean;
}) {
  const { timeRange, timeRangeLabel, setTimeRange, showTimeFilter } = useAnalytics();

  if (!showTimeFilter) return null;

  return (
    <>
      <div className="border-input bg-background/70 hidden items-center space-x-0.5 rounded-md border p-0.5 md:flex">
        {allowCustomRange && <></>}
        {TIME_RANGE_LITERALS.map((r) => (
          <Button
            key={r}
            variant={r === timeRange ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-6 w-12 justify-center rounded-sm px-0 text-[11px]',
              r === timeRange ? 'font-medium' : 'font-normal',
            )}
            onClick={() => setTimeRange(r)}
          >
            {r}
          </Button>
        ))}
      </div>
    </>
  );
}
