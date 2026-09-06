'use client';

import React, { useEffect } from 'react';
import { authClient } from '@[removed]/auth/client';
import { KpiCard, ChartDataItem } from '@/components/dashboard/kpi-card';
import {
  Activity,
  ArrowDownUp,
  AlertTriangle,
  Plug2,
  Sparkles,
  Gauge,
  Zap,
  KeyRound,
  FileText,
  ArrowRight,
  MessageSquare as MessageSquareIcon,
  Wifi,
} from 'lucide-react';
import { Button } from '@[removed]/ui/components/button';
import { Badge } from '@[removed]/ui/components/badge';
import { Separator } from '@[removed]/ui/components/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@[removed]/ui/components/tooltip';
import { cn } from '@[removed]/ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TopChannelsSection } from '@/components/dashboard/overview/top-channels-section';
import { ActivitySection } from '@/components/dashboard/overview/activity-section';
import type { ActivityRowItem } from '@/components/dashboard/overview/activity-row';
import { useAnalytics } from '@/analytics/components/store';

// Sample data type for clarity
// interface TimeValuePoint { time: string; value: number; }
// interface TimeConnectionsPoint { time: string; connections: number; }
// interface TimeRatePoint { time: string; rate: number; }

// Keep specific types for generation clarity, but ensure they conform to ChartDataItem structure
// interface TimeValuePoint { time: string; value: number; }
// interface TimeConnectionsPoint { time: string; connections: number; }
// interface TimeRatePoint { time: string; rate: number; }

// Simpler function to generate hourly data for specific keys
const generateHourlyData = (
  key: 'value' | 'connections' | 'rate',
  count: number,
  min: number,
  max: number,
  decimals: number = 0,
): ChartDataItem[] => {
  const data = [];
  for (let i = 0; i < count; i++) {
    const hour = String(i).padStart(2, '0');
    const numericValue = parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
    const entry: ChartDataItem = {
      time: `${hour}:00`,
    };
    entry[key] = numericValue;
    data.push(entry);
  }
  return data;
};

// Generate 24 hours of data
const sampleRevenueData: ChartDataItem[] = generateHourlyData('value', 24, 20, 150, 2);
const sampleConnectionsData: ChartDataItem[] = generateHourlyData('connections', 24, 5, 25);
const sampleChurnData: ChartDataItem[] = generateHourlyData('rate', 24, 0.5, 3.0, 1);

// Mock data as ActivityRowItem[] - must include timestamp, timeAgo, userData
const mockRecentActivity: ActivityRowItem[] = [
  {
    id: 1,
    timestamp: '12:34:56.123',
    type: 'connect',
    description: 'New connection established from sfo',
    timeAgo: '2m ago',
    userData: { name: 'User A', image: '' },
    color: 'success',
    icon: <Plug2 className="h-3 w-3" />,
    details: { region: 'sfo' },
  },
  {
    id: 2,
    timestamp: '12:34:56.123',
    type: 'message',
    description: "Message published to channel 'chat.123'",
    timeAgo: '5m ago',
    userData: null,
    color: 'primary',
    icon: <MessageSquareIcon className="h-3 w-3" />,
    details: { channel: 'chat.123' },
  },
  {
    id: 3,
    timestamp: '12:34:56.123',
    type: 'error',
    description: 'Connection failed: Auth timeout in lhr',
    timeAgo: '10m ago',
    userData: { name: 'User B', image: 'https://github.com/shadcn.png' },
    color: 'destructive',
    icon: <AlertTriangle className="h-3 w-3" />,
    details: { region: 'lhr' },
  },
  {
    id: 6,
    timestamp: '12:34:56.123',
    type: 'message',
    description: "Message published to channel 'presence.game-lobby'",
    timeAgo: '11m ago',
    userData: null,
    color: 'primary',
    icon: <MessageSquareIcon className="h-3 w-3" />,
    details: { channel: 'presence.game-lobby' },
  },
  {
    id: 4,
    timestamp: '12:34:56.123',
    type: 'connect',
    description: 'New connection established from iad',
    timeAgo: '12m ago',
    userData: { name: 'User C', image: '' },
    color: 'success',
    icon: <Plug2 className="h-3 w-3" />,
    details: { region: 'iad' },
  },
  {
    id: 5,
    timestamp: '12:34:56.123',
    type: 'disconnect',
    description: 'Connection closed gracefully from syd',
    timeAgo: '15m ago',
    userData: { name: 'User A', image: '' },
    color: 'accent',
    icon: <Wifi className="h-3 w-3" />,
    details: { region: 'syd' },
  },
];

const mockTopChannels = [
  { id: 'chat.123', subscribers: 152, messages_1h: 450 },
  { id: 'presence.room-abc', subscribers: 88, messages_1h: 120 },
  { id: 'notifications.user-xyz', subscribers: 1, messages_1h: 35 },
  { id: 'global-updates', subscribers: 512, messages_1h: 5 },
  { id: 'game.match-456', subscribers: 32, messages_1h: 1800 },
];

// Define the type for quick links
interface QuickLinkItem {
  title: string;
  href: string;
  icon: React.ReactElement<{ className?: string }>;
  description?: string;
  isExternal?: boolean;
}

const quickLinks = (orgSlug: string | undefined): QuickLinkItem[] => [
  {
    title: 'Manage Connections',
    href: `/${orgSlug}/connections`,
    icon: <Zap className="h-4 w-4" />,
  },
  {
    title: 'Manage API Keys',
    href: `/${orgSlug}/settings/api-keys`,
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    title: 'View Documentation',
    href: `https://docs.[removed].com`,
    icon: <FileText className="h-4 w-4" />,
    isExternal: true,
  },
];

export default function DashboardPage() {
  const session = authClient.useSession();
  const pathname = usePathname();
  const { data: activeOrg } = authClient.useActiveOrganization();

  const { setShowTimeFilter } = useAnalytics();

  useEffect(() => {
    setShowTimeFilter(true);
    return () => {
      setShowTimeFilter(false);
    };
  }, [setShowTimeFilter]);

  // Memoize the creation of the mapped/manipulated data
  const subscriptionsChartData = React.useMemo(() => {
    // Map directly over ChartDataItem[] - ensure keys exist before accessing
    return sampleRevenueData.map((d) => {
      const newValue = typeof d.value === 'number' ? d.value * 0.8 : 0;
      return { ...d, value: newValue };
    });
    // Keep .reverse() removed for now based on previous tests
  }, []); // Empty dependency array as sampleRevenueData is static

  // Memoize and render overview sections
  return (
    <div className="animate-in fade-in mx-auto max-w-[1920px] p-6 duration-500">
      {/* Page Header with refined spacing and subtle decoration */}
      <div className="relative mb-5 flex items-center justify-between after:absolute after:-bottom-5 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Overview
            <Badge
              variant="outline"
              className="bg-primary/5 border-primary/20 ml-1 h-4 px-1.5 py-0 text-[10px]"
            >
              <Sparkles className="text-primary mr-0.5 h-2.5 w-2.5" />
              REALTIME
            </Badge>
          </h1>
          {activeOrg ? (
            <p className="text-muted-foreground text-sm">
              Showing data for <span className="text-foreground font-medium">{activeOrg.name}</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">&nbsp; </p>
          )}
        </div>
        {/* --- Header Actions --- */}
        <div className="flex items-center space-x-1">
          {/* Pills (≥sm) */}
          <div className="ml-3 hidden items-center gap-2 sm:flex">
            {[
              {
                href: `/${activeOrg?.slug}/settings/api-keys`,
                label: 'API Keys',
                icon: <KeyRound className="h-4 w-4" />,
                active: pathname.includes('/settings/api-keys'),
              },
              {
                href: `/${activeOrg?.slug}/connections`,
                label: 'Connections',
                icon: <Zap className="h-4 w-4" />,
                active: pathname.includes('/connections'),
              },
              {
                href: 'https://docs.[removed].com',
                label: 'Documentation',
                icon: <FileText className="h-4 w-4" />,
                external: true,
              },
            ].map((b) => (
              <Button
                key={b.href}
                asChild
                variant={b.active ? 'secondary' : 'outline'}
                size="sm"
                className={cn(
                  'h-8 gap-1.5 px-3 text-xs font-medium transition-all duration-300',
                  b.active ? 'shadow-sm' : 'hover:shadow-sm',
                )}
              >
                <Link
                  href={b.href}
                  target={b.external ? '_blank' : undefined}
                  rel={b.external ? 'noopener noreferrer' : undefined}
                >
                  {b.icon}
                  {b.label}
                </Link>
              </Button>
            ))}
          </div>

          {/* Icon-only (xs) */}
          <TooltipProvider delayDuration={0}>
            <div className="ml-2 flex items-center space-x-1 sm:hidden">
              {quickLinks(activeOrg?.slug).map((link) => (
                <Tooltip key={link.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={link.href}
                      target={link.isExternal ? '_blank' : undefined}
                      rel={link.isExternal ? 'noopener noreferrer' : undefined}
                      passHref
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-muted/60 h-7 w-7 transition-all duration-150"
                        aria-label={link.title}
                      >
                        {link.icon}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>{link.title}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Dashboard Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-6">
        {/* KPI Cards Section - Full width on all screens */}
        <section className="col-span-full">
          <h2 className="text-muted-foreground mb-3 flex items-center text-sm font-medium">
            <Gauge className="mr-1.5 h-4 w-4" />
            Key Metrics
            <span className="text-muted-foreground/60 ml-2 text-xs">Last 24 hours</span>
          </h2>

          <div className="animate-in fade-in slide-in-from-top-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Infra-oriented KPIs */}
            <KpiCard
              title="Total Events"
              value="12.3M"
              description="+5.2% vs last 24h"
              chartData={sampleRevenueData}
              chartKey="value"
              icon={<Activity />}
              trend="positive"
            />
            <KpiCard
              title="Connections"
              value="2,350"
              description="+3.4% vs last 24h"
              chartData={subscriptionsChartData}
              chartKey="value"
              icon={<Plug2 />} // Plug icon represents socket connections
              trend="positive"
            />
            <KpiCard
              title="Error Rate"
              value="0.23%"
              description="-0.02% vs last 24h" // Downward trend (good)
              chartData={sampleChurnData}
              chartKey="rate"
              icon={<AlertTriangle />} // Alert icon for errors
              trend="positive" // Positive since error rate decreased
            />
            <KpiCard
              title="Requests / Min"
              value="745"
              description="+3.0% vs last 24h"
              chartData={sampleConnectionsData}
              chartKey="connections"
              icon={<ArrowDownUp />} // Represents requests rate
              trend="positive"
            />
          </div>
        </section>

        {/* Top Channels Overview */}
        <TopChannelsSection channels={mockTopChannels} orgSlug={activeOrg?.slug} />

        {/* Recent Activity Overview */}
        <ActivitySection items={mockRecentActivity} orgSlug={activeOrg?.slug} />
      </div>
    </div>
  );
}
