import React from 'react';
import Link from 'next/link';
import { FileWarningIcon, ArrowLeftIcon } from 'lucide-react';
import { Button } from '@[removed]/ui/components/button';

/**
 * 404 page shown when an email template is not found
 */
export default function EmailTemplateNotFound(): React.ReactElement {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center p-8">
      <div className="bg-destructive/10 mb-6 flex h-20 w-20 items-center justify-center rounded-full">
        <FileWarningIcon className="text-destructive h-10 w-10" />
      </div>

      <h1 className="mb-2 text-center text-2xl font-semibold">Email Template Not Found</h1>

      <p className="text-muted-foreground mb-6 max-w-md text-center">
        The email template you&apos;re trying to preview doesn&apos;t exist. Check the template name
        or create a new template in the{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">components/email/template</code>{' '}
        directory.
      </p>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/dev/preview-email">
          <ArrowLeftIcon className="h-4 w-4" />
          Return to Template List
        </Link>
      </Button>
    </div>
  );
}
