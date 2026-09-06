'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Users, Key, CreditCard, BarChart, FileText } from 'lucide-react';
import { cn } from '@[removed]/ui/lib/utils';
import { Badge } from '@[removed]/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@[removed]/ui/components/tooltip';

interface SettingsSidebarProps {
  baseUrl: string;
}

type NavItem = {
  title: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  disabled?: boolean;
  status?: {
    type: 'warn' | 'info';
    label: string;
  } | null;
};

export function SettingsSidebar({ baseUrl }: SettingsSidebarProps) {
  const pathname = usePathname();

  // Items with notifications/status indicators
  const navItems: NavItem[] = [
    {
      title: 'General',
      href: `${baseUrl}/general`,
      icon: <Settings className="size-4" strokeWidth={1.5} />,
      description: 'Basic team settings and preferences',
      status: null,
      disabled: false,
    },
    {
      title: 'Members',
      href: `${baseUrl}/members`,
      icon: <Users className="size-4" strokeWidth={1.5} />,
      description: 'Invite and manage team members',
    },
    {
      title: 'API Keys',
      href: `${baseUrl}/api-keys`,
      icon: <Key className="size-4" strokeWidth={1.5} />,
      description: 'Manage API keys for your organization',
      status: null,
    },
    {
      title: 'Billing',
      href: `${baseUrl}/billing`,
      icon: <CreditCard className="size-4" strokeWidth={1.5} />,
      description: 'Manage your subscription and payment methods',
      disabled: true,
    },
    {
      title: 'Usage',
      href: `${baseUrl}/usage`,
      icon: <BarChart className="size-4" strokeWidth={1.5} />,
      description: 'Monitor your resource usage and limits',
      status: null,
      disabled: true,
    },
    {
      title: 'Logs',
      href: `${baseUrl}/logs`,
      icon: <FileText className="size-4" strokeWidth={1.5} />,
      description: 'View activity logs and debug information',
      status: null,
      disabled: true,
    },
  ];

  return (
    <aside className="w-full md:w-48">
      <div className="sticky top-20">
        <div className="border-border bg-card/80 rounded-md border">
          <div className="py-1">
            <h2 className="text-muted-foreground/70 px-3 py-2 text-xs font-medium uppercase tracking-wider">
              Settings
            </h2>
            <nav className="flex flex-col space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <div key={item.href} className="relative px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {item.disabled ? (
                          <div
                            className={cn(
                              'group flex cursor-not-allowed items-center rounded-md px-3 py-2 text-sm opacity-40',
                            )}
                          >
                            <div
                              className={cn(
                                'text-muted-foreground flex h-5 w-5 items-center justify-center',
                              )}
                            >
                              {item.icon}
                            </div>
                            <div className="ml-3 flex-1">
                              <p className="text-sm tracking-tight">{item.title}</p>
                            </div>
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            prefetch={true}
                            className={cn(
                              'group flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                              isActive
                                ? 'bg-secondary text-foreground'
                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                            )}
                          >
                            <div
                              className={cn(
                                'flex h-5 w-5 items-center justify-center',
                                isActive ? 'text-primary' : 'text-muted-foreground',
                              )}
                            >
                              {item.icon}
                            </div>
                            <div className="ml-3 flex-1">
                              <p
                                className={cn('text-sm tracking-tight', isActive && 'font-medium')}
                              >
                                {item.title}
                              </p>
                            </div>

                            {item.status && (
                              <Badge
                                variant={item.status.type === 'warn' ? 'destructive' : 'secondary'}
                                className="ml-auto h-5 px-1 py-0 text-[10px]"
                              >
                                {item.status.label}
                              </Badge>
                            )}
                          </Link>
                        )}
                      </TooltipTrigger>
                      {item.disabled && (
                        <TooltipContent side="right" align="center" sideOffset={10}>
                          Coming soon
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {isActive && !item.disabled && (
                      <div className="bg-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full" />
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
}
