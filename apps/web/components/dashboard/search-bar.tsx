'use client';

import { Input } from '@[removed]/ui/components/input';
import { Search } from 'lucide-react';

export function SearchBar() {
  return (
    <div className="w-72">
      <div className="relative">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search channels, metrics..."
          className="bg-background/60 border-border/50 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/50 focus-visible:border-primary/50 hover:border-primary/30 h-9 w-full pl-10 transition-colors"
        />
      </div>
    </div>
  );
}
