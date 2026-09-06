'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TemplateLinkProps {
  id: string;
  name: string;
}

export default function TemplateLink({ id, name }: TemplateLinkProps): React.ReactElement {
  const pathname = usePathname();
  const currentTemplate = pathname.split('/').pop() || '';
  const isActive = currentTemplate === id;

  return (
    <Link
      href={`/dev/preview-email/${id}`}
      className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${
        isActive ? 'bg-primary/5 text-primary font-medium' : 'text-foreground/80 hover:bg-muted/50'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <div
        className={`size-2 rounded-full ${isActive ? 'bg-primary' : 'bg-muted'}`}
        aria-hidden="true"
      />
      <span>{name}</span>
      {isActive && <span className="text-primary ml-auto text-xs">Current</span>}
    </Link>
  );
}
