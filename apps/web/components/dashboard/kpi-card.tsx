'use client';

import { Card, CardContent, CardHeader } from '@[removed]/ui/components/card';
import { ChartContainer } from '@[removed]/ui/components/chart';
import { cn } from '@[removed]/ui/lib/utils';
import { Skeleton } from '@[removed]/ui/components/skeleton';
import { ArrowDown, ArrowUp } from 'lucide-react';
import * as React from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { ChartTooltipContent } from '@[removed]/ui/components/chart';
import { Activity } from 'lucide-react';

// Define a more specific type for chart data items
export interface ChartDataItem {
  time: string | number;
  [key: string]: number | string; // Allow time key and one dynamic value key
}

interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  description?: string;
  chartData: ChartDataItem[]; // Use the specific type
  chartKey: string; // This key should exist in ChartDataItem
  icon?: React.ReactNode;
  trend?: 'positive' | 'negative';
  animateChart?: boolean;
  isLoading?: boolean;
}

export function KpiCard({
  title,
  value,
  description,
  chartData,
  chartKey,
  icon,
  trend,
  animateChart = true,
  isLoading = false,
  className,
}: KpiCardProps) {
  const isNegative = trend === 'negative';
  const trendColorClass = isNegative
    ? 'text-destructive'
    : trend === 'positive'
      ? 'text-success'
      : 'text-muted-foreground/80';
  const TrendIcon = trend === 'positive' ? ArrowUp : isNegative ? ArrowDown : null;

  const config = React.useMemo(
    () => ({
      [chartKey]: {
        label:
          typeof chartKey === 'string'
            ? chartKey.charAt(0).toUpperCase() + chartKey.slice(1)
            : String(chartKey),
        color: `hsl(var(--chart-1))`,
      },
    }),
    [chartKey],
  );

  const clipPathId = `clip-${chartKey}-${React.useId()}`;
  const gradientId = `gradient-${chartKey}-${React.useId()}`;

  // Validate chartData structure in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && chartData && chartData.length > 0) {
      // Ensure chartData[0] exists before accessing properties
      const firstItem = chartData[0];
      if (firstItem && !(chartKey in firstItem)) {
        console.warn(
          `KpiCard: chartKey "${chartKey}" not found in the first item of chartData.`,
          chartData[0],
        );
      }
      if (firstItem && !('time' in firstItem)) {
        console.warn(`KpiCard: "time" key not found in the first item of chartData.`, firstItem);
      }
    }
  }, [chartData, chartKey]);

  return (
    <Card
      className={cn(
        'border-border/10 bg-card/80 group relative flex flex-col overflow-hidden transition-all duration-300',
        'pb-0 pt-0 shadow-sm backdrop-blur-sm hover:shadow-md hover:brightness-[1.02]',
        className,
        isLoading ? '' : 'hover:border-border/40 hover:bg-card/95',
        trend === 'positive'
          ? 'hover:shadow-success/5'
          : trend === 'negative'
            ? 'hover:shadow-destructive/5'
            : '',
      )}
    >
      <CardContent className="relative z-0 flex-1 p-0">
        <div className="h-32 w-full">
          {isLoading ? (
            <Skeleton className="bg-muted/40 h-full w-full" />
          ) : chartData && chartData.length > 1 ? (
            <ChartContainer config={{ ...config }} className="h-full w-full">
              <ResponsiveContainer width="100%">
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ left: -1, right: -1, top: 10, bottom: 0 }}
                >
                  <defs>
                    <clipPath id={clipPathId}>
                      <rect x="0" y="0" width="100%" height="100%" />
                    </clipPath>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={
                          trend === 'positive'
                            ? 'var(--color-success)'
                            : trend === 'negative'
                              ? 'var(--color-destructive)'
                              : 'var(--color-chart-1)'
                        }
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor={
                          trend === 'positive'
                            ? 'var(--color-success)'
                            : trend === 'negative'
                              ? 'var(--color-destructive)'
                              : 'var(--color-chart-1)'
                        }
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    horizontal={true}
                    stroke="var(--color-border)"
                    opacity={0.15}
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis dataKey={chartKey} domain={[0, 'auto']} hide />
                  <Tooltip
                    cursor={{
                      stroke: 'var(--color-muted-foreground)',
                      strokeWidth: 1,
                      strokeDasharray: '4 4',
                    }}
                    content={<ChartTooltipContent hideLabel indicator="dot" />}
                  />
                  <Area
                    dataKey={chartKey}
                    type="monotone"
                    fill={`url(#${gradientId})`}
                    stroke={
                      trend === 'positive'
                        ? 'hsl(var(--success))'
                        : trend === 'negative'
                          ? 'hsl(var(--destructive))'
                          : 'hsl(var(--chart-1))'
                    }
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{
                      r: 4,
                      strokeWidth: 1,
                      fill:
                        trend === 'positive'
                          ? 'hsl(var(--success))'
                          : trend === 'negative'
                            ? 'hsl(var(--destructive))'
                            : 'hsl(var(--primary))',
                      className: 'animate-pulse',
                    }}
                    clipPath={`url(#${clipPathId})`}
                    {...(animateChart &&
                      !isLoading && {
                        animationDuration: 1400,
                        animationEasing: 'ease-out',
                      })}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="bg-muted/30 absolute inset-0 flex flex-col items-center justify-center rounded-sm">
              <Activity className="text-muted-foreground/50 h-6 w-6" strokeWidth={1.5} />
              <span className="text-muted-foreground/80 mt-1 text-xs">No data available</span>
            </div>
          )}
        </div>
      </CardContent>

      <div className="relative z-10 -mt-12 space-y-1 p-5 pt-0">
        <div className="absolute right-5 top-2">
          {isLoading ? (
            <Skeleton className="h-5 w-5 rounded-sm" />
          ) : (
            icon && (
              <div
                className={cn(
                  'text-muted-foreground/80 group-hover:text-foreground/90 transition-all duration-300 group-hover:scale-105',
                  trend === 'positive'
                    ? 'group-hover:text-success'
                    : trend === 'negative'
                      ? 'group-hover:text-destructive'
                      : '',
                )}
              >
                {React.cloneElement(
                  icon as React.ReactElement<{ className?: string; strokeWidth?: number }>,
                  {
                    className: cn('h-4 w-4', (icon as any).props?.className),
                    strokeWidth: (icon as any).props?.strokeWidth ?? 1.5,
                  },
                )}
              </div>
            )
          )}
        </div>
        {isLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          <>
            <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              {title}
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                {value}
              </div>
              {description && (
                <p
                  className={cn(
                    'm-0 mt-1 flex items-center text-xs font-medium tracking-tight',
                    trendColorClass,
                  )}
                >
                  {TrendIcon && <TrendIcon className="mr-0.5 h-3 w-3" />}
                  {description}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
