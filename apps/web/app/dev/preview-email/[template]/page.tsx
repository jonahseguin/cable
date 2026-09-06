import React from 'react';
import { notFound } from 'next/navigation';
import { PropsConfiguration } from '@/components/email/props-configuration';
import type { EmailTemplateComponent } from '@/lib/email-utils';
import { z } from 'zod';
import { render } from '@react-email/components';

type PreviewPageProps = {
  params: {
    template: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
} & any;

export default async function EmailPreviewPage({
  params,
  searchParams,
}: PreviewPageProps): Promise<React.ReactElement> {
  params = await params;
  searchParams = await searchParams;
  const emailType = params.template;

  try {
    // Dynamically import the email template
    const EmailModule = await import(`@/components/email/template/${emailType}`).catch(() => {
      throw new Error(`Email template "${emailType}" not found`);
    });

    if (!EmailModule.default) {
      return notFound();
    }

    // Get the template component and schema
    const EmailComponent = EmailModule.default as EmailTemplateComponent<z.ZodTypeAny>;
    const defaultProps = EmailComponent.defaultProps || {};

    // Create initial props based on defaults and URL params
    const initialProps: Record<string, unknown> = { ...defaultProps };

    // Add URL params to initial props (filtering out config param)
    Object.entries(searchParams).forEach(([key, value]) => {
      if (key !== 'config' && value !== undefined) {
        initialProps[key] = typeof value === 'string' ? value : (value as string[])[0];
      }
    });

    // Validate props with schema if available
    let validatedProps = initialProps;
    if (EmailComponent.schema) {
      try {
        validatedProps = EmailComponent.validate(initialProps);
      } catch (error) {
        console.error('Error validating props with schema:', error);
        // Continue with unvalidated props rather than failing completely
      }
    }

    const html = await render(<EmailComponent {...validatedProps} />);

    return (
      <>
        <PropsConfiguration
          emailType={emailType}
          hasSchema={!!EmailComponent.schema}
          currentProps={validatedProps}
        >
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </PropsConfiguration>
      </>
    );
  } catch (error) {
    console.error('Failed to load email template:', error);
    return notFound();
  }
}
