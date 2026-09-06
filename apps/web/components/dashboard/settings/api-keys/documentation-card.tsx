'use client';

import { Button } from '@sock8/ui/components/button';
import { ExternalLink } from 'lucide-react';

export function DocumentationCard() {
  return (
    <div className="flex items-center justify-between px-6 pt-5">
      <div className="flex items-center gap-3">
        <div className="bg-secondary/40 text-foreground/80 flex h-8 w-8 items-center justify-center rounded-md">
          <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-sm font-medium tracking-tight">Using Your API Key</h3>
          <p className="text-muted-foreground/80 mt-0.5 text-xs">
            Learn how to use your API key with our SDK
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        asChild
        className="focus:ring-focus-ring/20 h-8 text-xs focus:ring-2"
      >
        <a
          href="https://docs.sock8.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center"
        >
          View Documentation
          <ExternalLink className="ml-1.5 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      </Button>
    </div>
  );
}
