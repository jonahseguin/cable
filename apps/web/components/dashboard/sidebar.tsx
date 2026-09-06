'use client';

import {
  Activity,
  ChevronDown,
  Cog,
  FileText,
  LineChart,
  MessageSquare,
  SquareArrowOutUpRight,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@[removed]/ui/components/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@[removed]/ui/components/sidebar';

import { ProfileMenu } from '@/components/dashboard/profile-menu';
import SockLogo from '@/components/landing/sock-logo';
import { authClient } from '@[removed]/auth/client';
import { cn } from '@[removed]/ui/lib/utils';

export function DashboardSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  return (
    <Sidebar
      collapsible="icon"
      className="border-border/30 bg-sidebar/95 backdrop-blur-sm transition-all duration-300"
    >
      {state === 'expanded' && (
        <SidebarHeader className="border-border/10 h-14 border-b">
          <Link
            href={`/${activeOrganization?.slug}`}
            className="group flex h-full items-center justify-start overflow-hidden px-4"
          >
            <span className="flex items-center gap-2.5">
              <span className="bg-primary/8 text-primary group-hover:bg-primary/12 group-hover:shadow-primary/5 flex h-7 w-7 items-center justify-center rounded-md shadow-sm transition-all duration-200">
                <SockLogo className="size-5" />
              </span>
              <span className="text-lg font-semibold tracking-tight transition-colors duration-150">
                <span className="text-foreground/90 group-hover:text-foreground">sock</span>
                <span className="text-primary group-hover:text-primary/90 ml-[1px] -translate-y-0.5 font-mono">
                  8
                </span>
              </span>
            </span>
          </Link>
        </SidebarHeader>
      )}

      <SidebarContent className="from-sidebar-background/95 to-sidebar-background/90 bg-gradient-to-b px-1.5 py-3">
        <SidebarMenu className={cn('space-y-6', state === 'expanded' ? 'px-1.5' : '')}>
          {/* Core product features */}
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className="text-muted-foreground/70 group-hover/collapsible:text-muted-foreground/90 mb-1 flex items-center px-3 py-1 text-xs font-medium tracking-tight transition-colors duration-150"
              >
                <CollapsibleTrigger className="w-full">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">Overview</span>
                  </span>
                  <ChevronDown
                    className="text-muted-foreground/50 ml-auto h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180"
                    strokeWidth={1.5}
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent className="space-y-0.5 pl-0">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.endsWith(`/${activeOrganization?.slug}`)}
                      className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                    >
                      <Link
                        href={`/${activeOrganization?.slug}`}
                        prefetch={true}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                          'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                          'data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-active-text',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                            'text-muted-foreground/70',
                            'group-data-[active=true]:text-primary',
                          )}
                        >
                          <LineChart className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>
                        <span
                          className={cn(
                            'text-xs tracking-tight transition-all duration-150',
                            'text-muted-foreground/90 group-hover:text-foreground',
                            'group-data-[active=true]:text-primary group-data-[active=true]:font-medium',
                          )}
                        >
                          Dashboard
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes(`/${activeOrganization?.slug}/activity`)}
                      className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                    >
                      <Link
                        href={`/${activeOrganization?.slug}/activity`}
                        prefetch={true}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                          'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                          'data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-active-text',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                            'text-muted-foreground/70',
                            'group-data-[active=true]:text-primary',
                          )}
                        >
                          <Activity className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>
                        <span
                          className={cn(
                            'text-xs tracking-tight transition-all duration-150',
                            'text-muted-foreground/90 group-hover:text-foreground',
                            'group-data-[active=true]:text-primary group-data-[active=true]:font-medium',
                          )}
                        >
                          Activity
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>

          {/* Core Product Features */}
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className="text-muted-foreground/70 group-hover/collapsible:text-muted-foreground/90 mb-1 flex items-center px-3 py-1 text-xs font-medium tracking-tight transition-colors duration-150"
              >
                <CollapsibleTrigger className="w-full">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">Product</span>
                  </span>
                  <ChevronDown
                    className="text-muted-foreground/50 ml-auto h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180"
                    strokeWidth={1.5}
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent className="space-y-0.5 pl-0">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes(`/${activeOrganization?.slug}/connections`)}
                      className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                    >
                      <Link
                        href={`/${activeOrganization?.slug}/connections`}
                        prefetch={true}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                          'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                          'data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-active-text',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                            'text-muted-foreground/70',
                            'group-data-[active=true]:text-primary',
                          )}
                        >
                          <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>
                        <span
                          className={cn(
                            'text-xs tracking-tight transition-all duration-150',
                            'text-muted-foreground/90 group-hover:text-foreground',
                            'group-data-[active=true]:text-primary group-data-[active=true]:font-medium',
                          )}
                        >
                          Connections
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.includes(`/${activeOrganization?.slug}/channels`)}
                      className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                    >
                      <Link
                        href={`/${activeOrganization?.slug}/channels`}
                        prefetch={true}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                          'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                          'data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-active-text',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                            'text-muted-foreground/70',
                            'group-data-[active=true]:text-primary',
                          )}
                        >
                          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>
                        <span
                          className={cn(
                            'text-xs tracking-tight transition-all duration-150',
                            'text-muted-foreground/90 group-hover:text-foreground',
                            'group-data-[active=true]:text-primary group-data-[active=true]:font-medium',
                          )}
                        >
                          Channels
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>

          {/* Documentation */}
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className="text-muted-foreground/70 group-hover/collapsible:text-muted-foreground/90 mb-1 flex items-center px-3 py-1 text-xs font-medium tracking-tight transition-colors duration-150"
              >
                <CollapsibleTrigger className="w-full">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">Resources</span>
                  </span>
                  <ChevronDown
                    className="text-muted-foreground/50 ml-auto h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180"
                    strokeWidth={1.5}
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent className="space-y-0.5 pl-0">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                    >
                      <Link
                        href="https://docs.[removed].com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                          'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                            'text-muted-foreground/70',
                          )}
                        >
                          <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>
                        <span
                          className={cn(
                            'text-xs tracking-tight transition-all duration-150',
                            'text-muted-foreground/90 group-hover:text-foreground',
                            'inline-flex w-full items-center',
                          )}
                        >
                          Documentation
                          <SquareArrowOutUpRight
                            className="text-muted-foreground/60 group-hover:text-muted-foreground ml-auto mr-0.5 h-3 w-3 transition-colors duration-150"
                            strokeWidth={1.5}
                          />
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>

          {/* Administrative/Utility at bottom */}
          <div className="mt-auto">
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel
                  asChild
                  className="text-muted-foreground/70 group-hover/collapsible:text-muted-foreground/90 mb-1 flex items-center px-3 py-1 text-xs font-medium tracking-tight transition-colors duration-150"
                >
                  <CollapsibleTrigger className="w-full">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">Administration</span>
                    </span>
                    <ChevronDown
                      className="text-muted-foreground/50 ml-auto h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180"
                      strokeWidth={1.5}
                    />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent className="space-y-0.5 pl-0">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(`/${activeOrganization?.slug}/settings`)}
                        className="group h-8 w-full rounded-md px-0 transition-all duration-100"
                      >
                        <Link
                          href={`/${activeOrganization?.slug}/settings`}
                          prefetch={true}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-md px-3 py-1.5 transition-all',
                            'hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text',
                            'data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-active-text',
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-sm transition-all',
                              'text-muted-foreground/70',
                              'group-data-[active=true]:text-primary',
                            )}
                          >
                            <Cog className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </div>
                          <span
                            className={cn(
                              'text-xs tracking-tight transition-all duration-150',
                              'text-muted-foreground/90 group-hover:text-foreground',
                              'group-data-[active=true]:text-primary group-data-[active=true]:font-medium',
                            )}
                          >
                            Settings
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </div>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-border/10 mt-auto border-t pb-2 pt-2">
        <ProfileMenu state={state === 'expanded' ? 'expanded' : 'collapsed'} />
      </SidebarFooter>
    </Sidebar>
  );
}
