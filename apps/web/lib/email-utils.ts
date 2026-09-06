import React from 'react';
import { z } from 'zod';

/**
 * Base template information structure
 */
export interface EmailTemplate {
  id: string;
  name: string;
}

/**
 * Converts kebab-case to Title Case
 */
export function toTitleCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Type definition for an email template component with metadata
 */
export type EmailTemplateComponent<TSchema extends z.ZodTypeAny> = React.FC<
  Readonly<z.infer<TSchema>>
> & {
  title?: string;
  schema: TSchema;
  validate: (props: unknown) => z.infer<TSchema>;
  defaultProps: z.infer<TSchema>;
  formatSubject?: (props: z.infer<TSchema>) => string;
};

/**
 * Configuration for creating a typed email template
 */
export interface EmailTemplateConfig<TSchema extends z.ZodTypeAny> {
  /** The display name of the email template */
  title: string;

  /** Zod schema for validating props */
  schema: TSchema;

  /** React component for rendering the email */
  react: React.FC<z.infer<TSchema>>;

  /** Default props for testing and development */
  defaultProps?: z.infer<TSchema>;

  /** Optional function to format the email subject line */
  formatSubject?: (props: z.infer<TSchema>) => string;
}

/**
 * Helper function to define an email template with type safety.
 *
 * @param config - Configuration object for the email template
 * @returns A typed email template component with attached metadata
 */
export function defineEmailTemplate<TSchema extends z.ZodTypeAny>(
  config: EmailTemplateConfig<TSchema>,
): EmailTemplateComponent<TSchema> {
  const { title, schema, react, defaultProps, formatSubject } = config;
  const Component = react as EmailTemplateComponent<TSchema>;

  // Attach metadata to the component
  Component.title = title;
  Component.schema = schema;
  Component.validate = (props: unknown) => schema.parse(props);
  Component.defaultProps = defaultProps || ({} as z.infer<TSchema>);

  if (formatSubject) {
    Component.formatSubject = formatSubject;
  }

  return Component;
}
