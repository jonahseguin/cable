'use client';

import { useState } from 'react';
import { Button } from '@[removed]/ui/components/button';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import { cn } from '@[removed]/ui/lib/utils';

interface NewApiKeyAlertProps {
  apiKey: string;
}

export function NewApiKeyAlert({ apiKey }: NewApiKeyAlertProps) {
  const [copied, setCopied] = useState(false);

  function handleCopyKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="animate-in fade-in-50 px-6 py-5 duration-300">
      <div className="bg-secondary/60 border-secondary overflow-hidden rounded-md border shadow-sm">
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="bg-success/10 text-success flex h-8 w-8 items-center justify-center rounded-md">
              <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium tracking-tight">New API Key Generated</h3>
              <p className="text-muted-foreground/80 mb-4 mt-1 text-xs">
                This key will only be shown once. Copy it now.
              </p>

              <div className="bg-card border-border overflow-hidden rounded-md border font-mono shadow-sm">
                <div className="bg-secondary/60 border-border flex items-center border-b px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-success h-1.5 w-1.5 rounded-full"></div>
                    <span className="text-xs font-medium">PRODUCTION</span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <code
                    className={cn(
                      'text-foreground/80 mr-2 truncate text-xs transition-colors',
                      copied && 'text-success/90 font-medium',
                    )}
                  >
                    {apiKey}
                  </code>
                  <Button
                    variant={copied ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleCopyKey}
                    className={cn(
                      'h-7 min-w-14 shrink-0 text-xs transition-all',
                      copied && 'bg-success text-success-foreground scale-[1.01]',
                    )}
                  >
                    {copied ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
