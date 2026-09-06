'use client';

import { authClient } from '@sock8/auth/client';
import { Button } from '@sock8/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@sock8/ui/components/dropdown-menu';
import { Skeleton } from '@sock8/ui/components/skeleton';
import { cn } from '@sock8/ui/lib/utils';
import { ChevronDown, Plus } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export function TeamSwitcher() {
  const { data: organizations, isPending: isOrganizationsLoading } =
    authClient.useListOrganizations();
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const [open, setOpen] = useState(false);

  const activeOrganization = organizations?.find(
    (org) => org.id === session?.session.activeOrganizationId,
  );

  // Show loading state if: data is loading, data not available yet, or no active organization found
  const shouldShowLoading =
    isOrganizationsLoading || isSessionLoading || !organizations || !session || !activeOrganization;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-background/95 border-border/50 text-foreground hover:bg-secondary/30 hover:border-border/70 flex h-8 items-center gap-2 rounded-[4px] px-2 transition-all duration-200"
        >
          <div className="flex flex-1 items-center gap-1.5">
            {shouldShowLoading ? (
              <>
                <Skeleton className="bg-foreground/10 h-5 w-5 rounded-[3px]" />
                <div className="flex flex-col items-start">
                  <Skeleton className="bg-foreground/10 h-3.5 w-20" />
                </div>
              </>
            ) : (
              <>
                {activeOrganization.logo ? (
                  <Image
                    src={activeOrganization.logo}
                    alt={activeOrganization.name}
                    width={18}
                    height={18}
                    className="border-border/30 rounded-[3px] border shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  />
                ) : (
                  <div className="bg-primary/10 text-primary flex h-[18px] w-[18px] items-center justify-center rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors">
                    <span className="text-[10px] font-medium leading-none tracking-tight">
                      {activeOrganization.name.slice(0, 2)}
                    </span>
                  </div>
                )}
                <span className="text-xs font-medium leading-none tracking-tight">
                  {activeOrganization.name}
                </span>
              </>
            )}
          </div>
          <ChevronDown
            className={cn(
              'text-muted-foreground h-3 w-3 transition-transform duration-200',
              open && 'rotate-180',
            )}
            strokeWidth={1.5}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="bg-card border-border/40 w-56 overflow-hidden rounded-[4px] border p-0 shadow-[0_2px_6px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        {shouldShowLoading ? (
          <TeamListSkeleton />
        ) : (
          <TeamList
            organizations={organizations}
            activeOrganizationId={session.session.activeOrganizationId ?? undefined}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamListSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="border-border/40 bg-card/50 flex items-center justify-between border-b px-2.5 py-1.5">
        <h4 className="text-muted-foreground text-xs font-medium leading-none tracking-tight">
          Teams
        </h4>
      </div>
      <div className="py-0.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="py-1.25 flex items-center gap-2 px-2.5">
            <Skeleton className="h-5 w-5 rounded-[3px]" />
            <div className="flex flex-col gap-[3px]">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-14" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TeamListProps {
  organizations: Array<{ id: string; name: string; projectCount?: number; logo?: string | null }>;
  activeOrganizationId?: string;
}

function TeamList({ organizations, activeOrganizationId }: TeamListProps) {
  return (
    <div className="flex flex-col">
      <div className="border-border/40 bg-card/50 flex items-center justify-between border-b px-2.5 py-1.5">
        <h4 className="text-muted-foreground text-xs font-medium leading-none tracking-tight">
          Teams
        </h4>
      </div>
      <div className="py-0.5 focus:outline-none" tabIndex={0} role="listbox">
        {/* Team list items */}
        {organizations.map((org, index) => (
          <TeamItem
            key={org.id}
            id={org.name.slice(0, 2)}
            name={org.name}
            projectCount={org.projectCount || 0}
            logo={org.logo}
            isActive={org.id === activeOrganizationId}
            tabIndex={index + 1}
          />
        ))}
        {organizations.length === 0 && (
          <div className="text-muted-foreground px-2.5 py-2 text-xs">No teams found</div>
        )}

        {/* Create team item - styled as a list item */}
        <div className="border-border/30 mt-0.5 border-t pt-0.5">
          <button
            className="py-1.25 text-muted-foreground hover:text-primary hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:ring-ring group flex w-full items-center gap-2 px-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-1"
            role="option"
            aria-selected={false}
            tabIndex={organizations.length + 1}
          >
            <div className="bg-secondary/30 text-muted-foreground/70 group-hover:bg-primary/10 group-hover:text-primary flex h-5 w-5 items-center justify-center rounded-[3px] transition-colors duration-150">
              <Plus className="h-3 w-3" strokeWidth={1.5} />
            </div>
            <span className="text-xs leading-none tracking-tight">Create new team...</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface TeamItemProps {
  id: string;
  name: string;
  projectCount: number;
  logo?: string | null;
  isActive?: boolean;
  tabIndex?: number;
}

function TeamItem({ id, name, projectCount, logo, isActive, tabIndex }: TeamItemProps) {
  return (
    <button
      className={cn(
        'py-1.25 focus-visible:bg-secondary/30 focus-visible:ring-ring group flex w-full items-center gap-2 px-2.5 text-left outline-none transition-all duration-150 focus-visible:ring-1',
        isActive ? 'bg-secondary text-foreground' : 'text-card-foreground hover:bg-secondary/20',
      )}
      role="option"
      aria-selected={isActive}
      tabIndex={tabIndex}
    >
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={20}
          height={20}
          className="border-border/40 rounded-[3px] border shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-shadow group-hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
        />
      ) : (
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-[3px] shadow-sm transition-all duration-150 group-hover:shadow',
            isActive
              ? 'bg-primary/20 text-primary shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
              : 'bg-secondary/50 text-foreground/90',
          )}
        >
          <span className="text-[10px] font-medium leading-none">{id}</span>
        </div>
      )}
      <div className="flex flex-col gap-[3px]">
        <span
          className={cn(
            'text-xs leading-none tracking-tight transition-colors',
            isActive
              ? 'text-foreground font-semibold'
              : 'text-foreground/90 group-hover:text-foreground',
          )}
        >
          {name}
        </span>
        <span className="text-muted-foreground text-[9px] leading-none">
          {projectCount} {projectCount === 1 ? 'project' : 'projects'}
        </span>
      </div>
      {isActive && <div className="bg-primary ml-auto h-[5px] w-[5px] rounded-full"></div>}
    </button>
  );
}
