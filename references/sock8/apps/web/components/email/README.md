# Email Components

This directory contains email components and utilities for sock8.

## Directory Structure

- `template/` - Email templates that can be previewed in the development environment
- `device-preview-client.tsx` - Client component for previewing emails with responsive controls
- `template-link.tsx` - Navigation component for the email template directory
- `layout.tsx` - Reusable email layout component for consistent styling across all emails
- `index.ts` - Exports for easy imports

## Reusable Components

### EmailLayout

A reusable layout component that provides consistent styling for all transactional emails.

```tsx
import { EmailLayout } from '@/components/email';

export function MyEmailTemplate() {
  return (
    <EmailLayout title="Your Custom Title" recipientEmail="user@example.com">
      {/* Your email content goes here */}
      <div>Content sections...</div>
      <a href="#" className="...">
        Call to action
      </a>
    </EmailLayout>
  );
}
```

Props:

- `children`: The main content of the email
- `recipientEmail?`: (Optional) The recipient's email address shown in the footer
- `title?`: (Optional) React node for the title displayed at the top of the email
- `accentClass?`: (Optional) Custom CSS class for the top accent bar (defaults to primary gradient)

## Creating New Email Templates

To create a new email template, add a new file to the `types/` directory following this pattern:

```tsx
import * as React from 'react';
import { z } from 'zod';
import { defineEmailTemplate } from '@/lib/email-utils';

// Define the Zod schema for your props
const myEmailSchema = z.object({
  recipientName: z.string().min(1, 'Name is required'),
  // Add more props as needed
});

// Create and export the email template using our utility
export default defineEmailTemplate(myEmailSchema, (props) => {
  // Your email template JSX goes here
  return (
    <div>
      <h1>Hello {props.recipientName}</h1>
      {/* ... */}
    </div>
  );
});

// Optionally export the schema for external use
export const schema = myEmailSchema;
```

## Preview System

Email templates can be previewed at `/dev/preview-email/[template-name]`. The preview system will:

1. Automatically discover templates in the `template/` directory
2. Allow passing props via URL parameters
3. Validate props against the template's Zod schema
4. Show a responsive preview with mobile/tablet/desktop options
5. Provide an interactive props configuration interface for real-time customization

### Interactive Props Configuration

The preview system includes a floating props configuration panel inspired by Storybook that allows for completely non-disruptive real-time editing:

- **Truly Live Updates**: Changes appear instantly in the preview without any page refresh or disruption
- **Streamlined Workflow**: Modify props and see changes in real-time as you type
- **Drag-and-Drop Positioning**: Position the panel anywhere on screen for optimal workflow
- **Enhanced User Experience**:
  - Persistent panel stays open while you interact with the email
  - Panel state is preserved between refreshes
  - Collapsible UI for minimal visual footprint
  - Type-appropriate controls for each prop (text, number, boolean, etc.)
  - JSON editing with real-time validation and updating
- **Shareable URLs**: The URL is silently updated with your current parameters, allowing you to share specific configurations via link without disrupting your workflow

To access the props configuration panel, click the "Props" button that appears in the top-right corner of the preview page. The panel allows complete interaction with the email while configuring props, creating a seamless development experience.

## Utilities

### `defineEmailTemplate`

A utility for creating type-safe email templates with Zod validation:

```tsx
import { defineEmailTemplate } from '@/lib/email-utils';

export default defineEmailTemplate(
  schema, // Zod schema defining props
  (props) => {
    // Render function - props are fully typed based on schema
    return <YourTemplate {...props} />;
  },
);
```

This utility provides:

- TypeScript type inference for your props
- Runtime validation via Zod
- Automatic compatibility with the preview system
