import React from 'react';
import { Badge } from '@[removed]/ui/components/badge';
import { InfoIcon, CodeIcon, FolderIcon } from 'lucide-react';
import DevicePreviewClient from '@/components/email/device-preview-client';
import TemplateLink from '@/components/email/template-link';
import type { EmailTemplate } from '@/lib/email-utils';
import { Toaster } from 'sonner';

interface SidebarTemplateListProps {
  templates: EmailTemplate[];
}

/**
 * Component that displays the list of available email templates
 */
const SidebarTemplateList = async ({
  templates,
}: SidebarTemplateListProps): Promise<React.ReactElement> => {
  return (
    <div className="border-border/50 bg-card/50 rounded-lg border shadow-sm">
      <div className="border-border/20 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderIcon size={14} className="text-primary" />
          <h2 className="text-sm font-medium">Email Templates</h2>
        </div>
        <Badge variant="secondary" className="text-xs">
          {templates.length}
        </Badge>
      </div>

      <div className="divide-border/20 divide-y">
        {templates.length > 0 ? (
          templates.map((template) => (
            <TemplateLink key={template.id} id={template.id} name={template.name} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-muted-foreground mb-2 text-sm">No templates found</p>
            <p className="text-muted-foreground text-xs">
              Create email templates in the components/email/template directory
            </p>
          </div>
        )}
      </div>

      <div className="border-border/20 border-t p-3">
        <div className="bg-muted/30 text-muted-foreground rounded-md p-3 text-xs">
          <strong className="text-foreground">Tip:</strong> Add new templates to{' '}
          <code className="bg-primary/10 text-primary-foreground rounded px-1 py-0.5 text-[10px]">
            components/email/template/
          </code>{' '}
          and they will automatically appear here.
        </div>
      </div>
    </div>
  );
};

interface EmailPreviewLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout for the email preview system
 */
export default async function EmailPreviewLayout({
  children,
}: EmailPreviewLayoutProps): Promise<React.ReactElement> {
  // Fetch all available email templates
  const getEmailTemplates = await import('@/lib/email-server-utils').then(
    (module) => module.getEmailTemplates,
  );
  const templates = await getEmailTemplates();

  return (
    <div className="bg-background/40 flex min-h-screen flex-col items-center p-6 pt-8">
      <Toaster richColors closeButton />
      <div className="mx-auto w-full max-w-5xl">
        {/* Dev environment header */}
        <div className="mb-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-md">
                <CodeIcon size={16} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Email Template Development</h1>
                <p className="text-muted-foreground text-sm">
                  Preview and test email templates before deployment
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary gap-1.5"
            >
              <InfoIcon size={12} />
              Development Environment
            </Badge>
          </div>
        </div>

        {/* Layout with template directory and preview */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Template directory */}
          <div className="lg:col-span-1">
            {/* Use the server component */}
            <SidebarTemplateList templates={templates} />

            {/* Instructions */}
            <div className="border-border/30 bg-muted/30 mt-5 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <div className="bg-background text-primary mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs">
                  i
                </div>
                <div>
                  <h3 className="text-sm font-medium">Usage Guide</h3>
                  <div className="text-muted-foreground mt-2 space-y-2 text-xs">
                    <p>• URL parameters customize template data</p>
                    <p>• Changes to source files are live-reloaded</p>
                    <p>• Use device controls to test responsive behavior</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview area with client component for device preview */}
          <div className="lg:col-span-3">
            <DevicePreviewClient>{children}</DevicePreviewClient>
          </div>
        </div>

        {/* Dev footer */}
        <div className="text-muted-foreground mt-6 flex items-center justify-between text-xs">
          <div>Development use only</div>
          <div className="flex items-center gap-2">
            <span className="text-primary">/dev/preview-email/[email_type]</span>
          </div>
        </div>
      </div>
    </div>
  );
}
