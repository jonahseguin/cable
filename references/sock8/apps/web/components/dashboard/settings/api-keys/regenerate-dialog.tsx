'use client';

import { Button } from '@sock8/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@sock8/ui/components/dialog';
import { AlertCircle, Key, RefreshCw } from 'lucide-react';
import { cn } from '@sock8/ui/lib/utils';

interface RegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  apiKeyExists: boolean;
  isAdmin: boolean;
  isRegenerating: boolean;
}

export function RegenerateDialog({
  open,
  onOpenChange,
  onConfirm,
  apiKeyExists,
  isAdmin,
  isRegenerating,
}: RegenerateDialogProps) {
  if (!open || !isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%] gap-0 p-0 shadow-sm duration-200 sm:max-w-md">
        <div className="data-[state=open]:animate-in data-[state=open]:fade-in-50 px-6 pb-4 pt-6 data-[state=open]:delay-100 data-[state=open]:duration-300">
          <div className="mb-4 flex items-center gap-3">
            {apiKeyExists ? (
              <div className="bg-destructive/10 text-destructive/80 flex h-9 w-9 items-center justify-center rounded-md">
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              </div>
            ) : (
              <div className="bg-secondary text-foreground/80 flex h-9 w-9 items-center justify-center rounded-md">
                <Key className="h-4 w-4" strokeWidth={1.5} />
              </div>
            )}
            <DialogTitle className="text-base tracking-tight">
              {apiKeyExists ? 'Regenerate API Key' : 'Generate API Key'}
            </DialogTitle>
          </div>

          <DialogDescription className="text-muted-foreground/80 text-sm">
            {apiKeyExists
              ? 'This will invalidate your current API key. Applications using the current key will stop working.'
              : 'Generate a new API key for your organization.'}
          </DialogDescription>
        </div>

        {apiKeyExists && (
          <div className="border-border bg-secondary/30 data-[state=open]:animate-in data-[state=open]:fade-in-50 mt-2 border-y px-6 py-4 data-[state=open]:delay-150 data-[state=open]:duration-300">
            <div className="text-destructive/90 flex items-start gap-3 text-xs">
              <AlertCircle className="text-destructive/80 mt-0.5 h-3.5 w-3.5" strokeWidth={1.5} />
              <div>
                <p className="font-medium">Danger: This action cannot be undone</p>
                <p className="mt-1 opacity-80">
                  Applications will need to be updated with the new key.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-muted/20 border-border data-[state=open]:animate-in data-[state=open]:fade-in-50 flex items-center justify-end gap-2 border-t px-6 py-4 data-[state=open]:delay-200 data-[state=open]:duration-300">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={isRegenerating}
            variant={apiKeyExists ? 'destructive' : 'default'}
            className={cn(
              'h-8 text-xs transition-all duration-150',
              isRegenerating && 'opacity-80',
              apiKeyExists && 'bg-destructive/90 hover:bg-destructive',
            )}
          >
            {isRegenerating && <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />}
            {apiKeyExists ? 'Regenerate key' : 'Generate key'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
