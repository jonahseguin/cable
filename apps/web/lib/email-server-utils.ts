'use server';

import { toTitleCase, type EmailTemplate } from './email-utils';
import { z } from 'zod';
import { type EmailTemplateComponent } from './email-utils';
import React from 'react';
import EmailWrapper from '@/components/email/email-wrapper';

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set. Emails will not be sent.');
}

/**
 * Server-side function to scan for available email templates
 *
 * @returns A promise that resolves to an array of email templates
 */
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const fs = await import('fs');
  const path = await import('path');

  try {
    // Path to email components directory
    const emailComponentsDir = path.join(process.cwd(), 'components', 'email', 'template');

    // Read directory contents
    const files = await fs.promises.readdir(emailComponentsDir);

    // Filter for TypeScript files and extract template info
    const templates = await Promise.all(
      files
        .filter((file) => file.endsWith('.tsx') || (file.endsWith('.ts') && file !== 'README.md'))
        .map(async (file) => {
          // Remove file extension to get the template ID
          const id = file.replace(/\.(tsx|ts)$/, '');

          try {
            // Load the module
            const mod = await import(`@/components/email/template/${id}`);
            const name = mod?.default?.title || toTitleCase(id);

            return { id, name };
          } catch (error) {
            console.error(`Error loading email template ${id}:`, error);
            // Still return the template with a fallback name
            return { id, name: toTitleCase(id) };
          }
        }),
    );

    // Filter out any undefined templates (though there shouldn't be any)
    return templates.filter(Boolean);
  } catch (error) {
    console.error('Error scanning email templates:', error);
    return [];
  }
}

export async function sendEmail<TSchema extends z.ZodTypeAny>({
  email,
  props,
  to,
  subject,
  from = 'sock8 <transactional@updates.sock8.com>',
}: {
  email: EmailTemplateComponent<TSchema>;
  props: z.infer<TSchema>;
  subject?: string;
  to: string;
  from?: string;
}): Promise<any | null> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { validate, formatSubject } = email;
  const Component = email;

  const validatedProps = validate(props);
  const emailSubject = formatSubject ? formatSubject(validatedProps) : subject;

  if (!emailSubject) {
    throw new Error('Subject is required');
  }

  // Create a React element from the component
  const element = React.createElement(Component, validatedProps);
  const wrapper = React.createElement(EmailWrapper, {}, element);

  const { data, error } = await resend.emails.send({
    from: from,
    to: [to],
    subject: emailSubject,
    react: wrapper,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export const convertSvgToPng = async (svg: string): Promise<Buffer> => {
  const sharp = await import('sharp').then((module) => module.default);
  const buffer = Buffer.from(svg, 'utf8');
  const png = await sharp(buffer, { density: 300 }).png().toBuffer();
  return png;
};

/**
 * Send a test email using template name instead of component reference
 */
export async function sendTestEmail({
  templateName,
  props,
  to,
  subject,
  from = 'sock8 <dev@updates.sock8.com>',
}: {
  templateName: string;
  props: Record<string, unknown>;
  to: string;
  subject?: string;
  from?: string;
}): Promise<any | null> {
  // Import the template component directly on the server
  const EmailModule = await import(`@/components/email/template/${templateName}`);
  if (!EmailModule.default) {
    throw new Error(`Email template "${templateName}" not found`);
  }

  const EmailComponent = EmailModule.default;

  // Now use the existing sendEmail function with the server-imported component
  return sendEmail({
    email: EmailComponent,
    props,
    to,
    subject: subject || `[Test] ${toTitleCase(templateName)} Email`,
    from,
  });
}
