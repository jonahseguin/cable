'use client';

import { authClient } from '@[removed]/auth/client';
import { Avatar, AvatarFallback, AvatarImage } from '@[removed]/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@[removed]/ui/components/dropdown-menu';
import { Skeleton } from '@[removed]/ui/components/skeleton';
import { cn } from '@[removed]/ui/lib/utils';
import { ChevronDown, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
interface ProfileMenuProps {
  state: 'expanded' | 'collapsed' | 'hidden';
}

export function ProfileMenu({ state }: ProfileMenuProps) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const router = useRouter();

  // Reset confirm state when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmLogout(false);
    }
  }, [isOpen]);

  // Return skeleton loader when no user data is available
  if (isPending || !user) {
    return (
      <div className="px-2">
        <div
          className={`flex w-full items-center gap-1.5 px-2 py-1.5 ${state === 'collapsed' ? 'justify-center' : ''}`}
        >
          <Skeleton className="h-7 w-7 rounded-full" />
          {state === 'expanded' && (
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Create initials from name
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      return;
    }

    setIsLoggingOut(true);
    try {
      await authClient.signOut();
      router.push('/', { scroll: false });
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  return (
    <div className="px-2">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={`hover:bg-secondary/40 focus-visible:ring-ring relative flex w-full items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-left outline-none transition-all duration-200 focus-visible:ring-1 ${state === 'collapsed' ? 'justify-center' : ''}`}
          >
            <Avatar className="border-border/30 h-7 w-7 border shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-200 hover:scale-[1.02]">
              {user.image ? (
                <AvatarImage src={user.image} alt={user.name} />
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            {state === 'expanded' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="text-foreground truncate text-xs font-medium leading-none tracking-tight">
                  {user.name}
                </span>
                <span className="text-muted-foreground truncate text-[10px] leading-none opacity-80 transition-all">
                  {user.email}
                </span>
              </div>
            )}
            {state === 'expanded' && (
              <ChevronDown
                className={`text-muted-foreground h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                strokeWidth={1.5}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={state === 'collapsed' ? 'center' : 'start'}
          side={state === 'collapsed' ? 'right' : 'top'}
          sideOffset={state === 'collapsed' ? 8 : 4}
          className="border-border/50 bg-card/95 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-2 w-56 overflow-hidden rounded-md border p-0 shadow-[0_4px_16px_rgba(0,0,0,0.16)] backdrop-blur-lg"
        >
          {/* User info header */}
          <div className="bg-card/95 relative overflow-hidden px-3 py-3">
            <div className="flex items-center gap-3">
              <Avatar className="border-border/40 h-10 w-10 border shadow-md">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name} />
                ) : (
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-medium tracking-tight">
                  {user.name}
                </span>
                <span className="text-muted-foreground text-xs">{user.email}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <DropdownMenuSeparator />

          {/* Account actions */}
          <div className="py-1 focus:outline-none" tabIndex={0} role="menu">
            <Link
              href="/settings"
              prefetch={true}
              onNavigate={() => setIsOpen(false)}
              role="menuitem"
              className="text-foreground hover:bg-secondary/50 focus-visible:bg-secondary/40 focus-visible:ring-ring group flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1"
            >
              <div className="bg-secondary/60 text-foreground/80 flex h-5 w-5 items-center justify-center rounded-sm transition-colors duration-150">
                <User className="h-3 w-3" strokeWidth={1.5} />
              </div>
              <span className="text-xs leading-none tracking-tight">Account settings</span>
            </Link>

            <button
              role="menuitem"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={cn(
                'focus-visible:ring-ring group flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-all duration-150 focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
                confirmLogout
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                  : 'text-foreground hover:bg-destructive/10 hover:text-destructive',
              )}
            >
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-sm transition-colors duration-150',
                  confirmLogout
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-secondary/60 text-foreground/80 group-hover:bg-destructive/15 group-hover:text-destructive',
                )}
              >
                {isLoggingOut ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                ) : (
                  <LogOut className="h-3 w-3" strokeWidth={1.5} />
                )}
              </div>
              <span className="text-xs leading-none tracking-tight">
                {isLoggingOut
                  ? 'Logging out...'
                  : confirmLogout
                    ? 'Click again to confirm'
                    : 'Logout'}
              </span>
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
