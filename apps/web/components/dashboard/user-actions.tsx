'use client';

import { Skeleton } from '@[removed]/ui/components';
import { Button } from '@[removed]/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@[removed]/ui/components/tooltip';
import { Bell, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function UserActions() {
  return (
    <div className="flex items-center gap-3">
      <ThemeSwitcher />
      <NotificationButton />
    </div>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render theme toggle on the client to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Skeleton className="h-9 w-9 rounded-md" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="text-muted-foreground hover:text-primary hover:bg-primary/5 h-9 w-9 rounded-md transition-colors"
      aria-label="Toggle theme"
    >
      {mounted ? (
        theme === 'dark' ? (
          <Sun className="h-[18px] w-[18px]" />
        ) : (
          <Moon className="h-[18px] w-[18px]" />
        )
      ) : (
        <Skeleton className="h-[18px] w-[18px]" />
      )}
    </Button>
  );
}

export function NotificationButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary hover:bg-primary/5 relative h-9 w-9 rounded-md transition-colors"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="bg-primary absolute right-2 top-2 flex h-2 w-2 rounded-full"></span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          hideArrow={true}
          className="bg-background/90 border-border/50 text-foreground flex items-center rounded-md border px-4 py-2 shadow-xl shadow-black/10 backdrop-blur-xl"
        >
          <div className="bg-primary mr-2.5 h-1.5 w-1.5 rounded-full opacity-75"></div>
          Notifications
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
