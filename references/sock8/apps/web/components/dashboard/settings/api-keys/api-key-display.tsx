'use client';

import { Badge } from '@sock8/ui/components/badge';
import { Button } from '@sock8/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sock8/ui/components/tooltip';
import { cn } from '@sock8/ui/lib/utils';
import { Key, Lock, RefreshCw } from 'lucide-react';

interface ApiKeyDisplayProps {
  apiKeyLast6: string | null;
  apiKeyCreatedAt: Date | null;
  isAdmin: boolean;
  onRegenerateClick: () => void;
}

export function ApiKeyDisplay({
  apiKeyLast6,
  apiKeyCreatedAt,
  isAdmin,
  onRegenerateClick,
}: ApiKeyDisplayProps) {
  if (!apiKeyLast6) {
    return (
      <div className="py-8 text-center">
        <div className="bg-secondary/80 text-foreground relative mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full">
          <Key className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h3 className="mb-1 text-sm font-medium tracking-tight">No API Key Yet</h3>
        <p className="text-muted-foreground/80 mx-auto mb-4 max-w-xs text-xs">
          Generate an API key to integrate with sock8.
        </p>
        <RegenerateButton
          className="mx-auto"
          isAdmin={isAdmin}
          apiKeyExists={false}
          onRegenerateClick={onRegenerateClick}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs">
        <Badge variant="outline" className="bg-secondary/80 border-secondary px-2 py-0.5 text-xs">
          Production
        </Badge>
        <div className="text-muted-foreground/80 flex items-center gap-1 text-xs">
          <div className="bg-foreground/30 h-1 w-1 rounded-full"></div>
          Created {new Date(apiKeyCreatedAt || new Date()).toLocaleDateString()}
        </div>
      </div>

      <div
        className="bg-secondary/40 hover:bg-secondary/60 focus-within:ring-ring border-border flex items-center justify-between overflow-hidden rounded-md border px-4 py-3 font-mono text-xs transition-colors duration-150 focus-within:ring-1"
        tabIndex={0}
      >
        <div className="flex items-center">
          <span className="text-foreground/90 font-medium">sock8_</span>
          <span className="text-muted-foreground/80">•••••••</span>
          <span className="font-medium">{apiKeyLast6}</span>
        </div>

        {isAdmin ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerateClick}
            className="h-6 px-2 text-xs opacity-80 transition-opacity duration-150 hover:opacity-100 focus:ring-0"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            <span className="sr-only">Regenerate API key</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="h-6 cursor-not-allowed px-2 text-xs opacity-40"
          >
            <Lock className="h-3 w-3" />
            <span className="sr-only">Admin only</span>
          </Button>
        )}
      </div>
    </div>
  );
}

interface RegenerateButtonProps {
  className?: string;
  showIcon?: boolean;
  showText?: boolean;
  isAdmin: boolean;
  apiKeyExists: boolean;
  onRegenerateClick: () => void;
}

export function RegenerateButton({
  className,
  showIcon = true,
  showText = true,
  isAdmin,
  apiKeyExists,
  onRegenerateClick,
}: RegenerateButtonProps) {
  if (!isAdmin) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled
            className={cn('h-8 cursor-not-allowed text-xs opacity-60', className)}
          >
            {showIcon && <Lock className="mr-1.5 h-3 w-3" />}
            {showText && 'Admin only'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Only organization admins or owners can manage API keys</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRegenerateClick}
      className={cn('h-8 text-xs transition-colors duration-150', className)}
    >
      {showIcon && <RefreshCw className="mr-1.5 h-3 w-3" />}
      {showText && (apiKeyExists ? 'Regenerate' : 'Generate')}
    </Button>
  );
}
