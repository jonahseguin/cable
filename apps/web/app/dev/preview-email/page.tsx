import React from 'react';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import Link from 'next/link';
import type { EmailTemplate } from '@/lib/email-utils';

/**
 * Index page listing all available email templates for preview
 */
export default async function EmailPreviewIndex(): Promise<React.ReactElement> {
  const getEmailTemplates = await import('@/lib/email-server-utils').then(
    (module) => module.getEmailTemplates,
  );
  const templates = await getEmailTemplates();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-center text-2xl font-semibold">Email Template Preview</h1>
        <p className="text-muted-foreground text-sm">
          Select a template below to view and customize its appearance
        </p>
      </div>

      <div className="grid gap-3">
        {templates.length > 0 ? (
          templates.map((template: EmailTemplate) => (
            <Link
              key={template.id}
              href={`/dev/preview-email/${template.id}`}
              className="border-border/50 bg-card/50 hover:bg-card/70 flex items-center justify-between rounded-lg border p-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-md">
                  <MailIcon size={16} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-medium">{template.name}</h2>
                  <p className="text-muted-foreground text-sm">
                    <code className="text-primary bg-primary/5 rounded px-1.5 py-0.5 text-xs">
                      {template.id}
                    </code>
                  </p>
                </div>
              </div>
              <ArrowRightIcon size={16} className="text-muted-foreground" />
            </Link>
          ))
        ) : (
          <div className="border-border/30 bg-muted/20 flex flex-col items-center rounded-lg border p-8 text-center">
            <div className="bg-muted text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <MailIcon size={20} />
            </div>
            <h3 className="mb-1 text-lg font-medium">No Email Templates Found</h3>
            <p className="text-muted-foreground mb-4 max-w-md text-sm">
              Create email templates in the{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">
                components/email/template
              </code>{' '}
              directory to preview them here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
