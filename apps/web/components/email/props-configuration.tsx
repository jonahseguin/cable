'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  XIcon,
  SlidersIcon,
  RotateCwIcon,
  CodeIcon,
  EyeIcon,
  MonitorIcon,
  SmartphoneIcon,
  SendIcon,
} from 'lucide-react';
import { Badge } from '@sock8/ui/components/badge';
import { Button } from '@sock8/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sock8/ui/components/tabs';
import { Switch } from '@sock8/ui/components/switch';
import { Input } from '@sock8/ui/components/input';
import { Textarea } from '@sock8/ui/components/textarea';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@sock8/ui/components/dialog';
import { toTitleCase } from '@/lib/email-utils';
import { sendTestEmail } from '@/lib/email-server-utils';

// Type definitions
type SchemaProperty = {
  type: string;
  isOptional: boolean;
  description?: string;
  format?: string;
};

type SchemaMap = Record<string, SchemaProperty>;

type Position = { right: number; top: number };

// Define device sizes as a typed constant
const DEVICE_SIZES = {
  mobile: 375,
  tablet: 768,
  desktop: 100, // percentage
} as const;

// Define device type
type DeviceType = keyof typeof DEVICE_SIZES;

interface PropsConfigurationProps {
  emailType: string;
  hasSchema?: boolean;
  currentProps: Record<string, unknown>;
  children: React.ReactNode;
}

// Schema-related utility functions
function extractSchemaInfo(schema: z.ZodType): SchemaMap {
  const schemaMap: SchemaMap = {};

  if (!schema) return schemaMap;

  try {
    // @ts-expect-error - accessing internal Zod API properties
    const shape = schema._def?.shape || schema._shape || {};

    if (Object.keys(shape).length > 0) {
      Object.entries(shape).forEach(([key, def]) => {
        processSchemaProperty(key, def, schemaMap);
      });
    } else {
      try {
        // @ts-expect-error - accessing internal Zod API properties
        if (schema._def?.typeName === 'ZodObject') {
          // @ts-expect-error - accessing internal Zod API properties
          const shape = schema.shape || {};
          Object.keys(shape).forEach((key) => {
            // Accessing internal Zod API properties
            const typeDef = shape[key];
            processSchemaProperty(key, typeDef, schemaMap);
          });
        }
      } catch (error) {
        console.error('Error in fallback schema extraction:', error);
      }
    }
  } catch (error) {
    console.error('Error extracting schema info:', error);
  }

  return schemaMap;
}

function processSchemaProperty(key: string, def: unknown, schemaMap: SchemaMap): void {
  let type = 'string';
  let isOptional = false;
  let description = '';
  let format: string | undefined = undefined;

  try {
    // @ts-expect-error - accessing internal Zod API properties
    const typeName = def?._def?.typeName;

    // Handle different Zod types
    if (!typeName) {
      type = 'string';
    } else if (typeName === 'ZodString') {
      type = 'string';
      // @ts-expect-error - accessing internal Zod API properties
      const checks = def._def?.checks || [];
      // @ts-expect-error - accessing internal Zod API properties
      if (checks.some((c) => c.kind === 'email')) format = 'email';
      // @ts-expect-error - accessing internal Zod API properties
      if (checks.some((c) => c.kind === 'url')) format = 'url';
    } else if (typeName === 'ZodNumber') {
      type = 'number';
    } else if (typeName === 'ZodBoolean') {
      type = 'boolean';
    } else if (typeName === 'ZodArray') {
      type = 'array';
    } else if (typeName === 'ZodObject') {
      type = 'object';
    } else if (typeName === 'ZodEnum') {
      type = 'enum';
    } else if (typeName === 'ZodOptional') {
      isOptional = true;
      // Extract inner type
      // @ts-expect-error - accessing internal Zod API properties
      const innerDef = def._def?.innerType;
      if (innerDef) {
        // Accessing internal Zod API properties
        const innerTypeName = innerDef._def?.typeName;
        if (innerTypeName === 'ZodString') {
          type = 'string';
          // Accessing internal Zod API properties
          const checks = innerDef._def?.checks || [];
          // @ts-expect-error - accessing internal Zod API properties
          if (checks.some((c) => c.kind === 'email')) format = 'email';
          // @ts-expect-error - accessing internal Zod API properties
          if (checks.some((c) => c.kind === 'url')) format = 'url';
        } else if (innerTypeName === 'ZodNumber') {
          type = 'number';
        } else if (innerTypeName === 'ZodBoolean') {
          type = 'boolean';
        } else if (innerTypeName === 'ZodArray') {
          type = 'array';
        } else if (innerTypeName === 'ZodObject') {
          type = 'object';
        } else if (innerTypeName === 'ZodEnum') {
          type = 'enum';
        }
      }
    } else if (typeName === 'ZodNullable') {
      // Extract inner type for nullable types
      // @ts-expect-error - accessing internal Zod API properties
      const innerDef = def._def?.innerType;
      // Accessing internal Zod API properties
      if (innerDef?._def?.typeName === 'ZodString') type = 'string';
      // Accessing internal Zod API properties
      else if (innerDef?._def?.typeName === 'ZodNumber') type = 'number';
    }

    // Try to get description
    // @ts-expect-error - accessing internal Zod API properties
    description = def._def?.description || '';

    // Add to schema map
    schemaMap[key] = {
      type,
      isOptional,
      description,
      format,
    };
  } catch (error) {
    console.error(`Error processing schema property ${key}:`, error);
    // Add a default entry even if there was an error
    schemaMap[key] = { type: 'string', isOptional: false };
  }
}

// Main component
export function PropsConfiguration({
  emailType,
  hasSchema = true,
  currentProps,
  children,
}: PropsConfigurationProps): React.ReactElement {
  const router = useRouter();
  const [localProps, setLocalProps] = React.useState<Record<string, unknown>>(currentProps);
  const [schema, setSchema] = React.useState<z.ZodType | null>(null);
  const [schemaInfo, setSchemaInfo] = React.useState<SchemaMap>({});
  const [jsonValue, setJsonValue] = React.useState<string>('');
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = React.useState<boolean>(hasSchema);
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>('desktop');
  const [containerWidth, setContainerWidth] = useState<string | number>('100%');
  const [isSending, setIsSending] = useState(false);
  const [isTestEmailDialogOpen, setIsTestEmailDialogOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');

  // Use URL parameters for panel state
  const isConfigOpen =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('config') === 'open';
  const [isVisible, setIsVisible] = React.useState<boolean>(isConfigOpen);

  // Default position
  const [position, setPosition] = React.useState<Position>({ right: 16, top: 80 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [startPos, setStartPos] = React.useState({ x: 0, y: 0 });

  // UI state
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<string>('controls');

  const panelRef = React.useRef<HTMLDivElement>(null);

  // Set container width based on selected device
  useEffect(() => {
    setContainerWidth(selectedDevice === 'desktop' ? '100%' : `${DEVICE_SIZES[selectedDevice]}px`);
  }, [selectedDevice]);

  // Load schema dynamically on the client side
  React.useEffect(() => {
    if (!hasSchema) return;

    const loadSchema = async (): Promise<void> => {
      try {
        setIsSchemaLoading(true);
        // Dynamically import the email template to get its schema
        const EmailModule = await import(`@/components/email/template/${emailType}`);

        if (EmailModule.default?.schema) {
          setSchema(EmailModule.default.schema);
        }
      } catch (error) {
        console.error('Failed to load email schema:', error);
      } finally {
        setIsSchemaLoading(false);
      }
    };

    loadSchema();
  }, [emailType, hasSchema]);

  // Extract schema info on schema change
  React.useEffect(() => {
    if (schema) {
      const info = extractSchemaInfo(schema);
      setSchemaInfo(info);
    } else if (currentProps && Object.keys(currentProps).length > 0) {
      // Create a simple schema based on prop types
      const fallbackInfo: SchemaMap = {};

      Object.entries(currentProps).forEach(([key, value]) => {
        let type = 'string';
        if (typeof value === 'number') type = 'number';
        if (typeof value === 'boolean') type = 'boolean';
        if (Array.isArray(value)) type = 'array';
        if (value !== null && typeof value === 'object') type = 'object';

        fallbackInfo[key] = {
          type,
          isOptional: true,
          description: '',
        };
      });

      setSchemaInfo(fallbackInfo);
    }
  }, [schema, currentProps]);

  // Initialize JSON representation for the JSON tab
  React.useEffect(() => {
    setJsonValue(JSON.stringify(localProps, null, 2));
  }, [localProps]);

  // Panel drag handlers
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return; // Only left mouse button
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging) return;

      const deltaX = e.clientX - startPos.x;
      const deltaY = e.clientY - startPos.y;

      setPosition((prev) => ({
        right: Math.max(0, prev.right - deltaX),
        top: Math.max(0, prev.top + deltaY),
      }));

      setStartPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startPos]);

  // Direct URL updates without debounce for immediate reactivity
  const updateURLWithProps = React.useCallback(
    (newProps: Record<string, unknown>) => {
      // Create a new URL with current props as params
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      // Add/update each prop as a param
      Object.entries(newProps).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        } else {
          params.delete(key);
        }
      });

      // Preserve the config=open param if panel is visible
      if (isVisible) {
        params.set('config', 'open');
      } else {
        params.delete('config');
      }

      // Update URL without reloading the page
      url.search = params.toString();
      router.replace(url.toString(), { scroll: false });
    },
    [isVisible, router],
  );

  // Handle prop input changes
  const handleInputChange = (key: string, value: unknown): void => {
    const newProps = { ...localProps, [key]: value };
    setLocalProps(newProps);
    updateURLWithProps(newProps);
  };

  // Toggle panel visibility
  const toggleVisibility = (): void => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);

    // Update URL to reflect panel state
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    if (newVisibility) {
      params.set('config', 'open');
    } else {
      params.delete('config');
    }

    url.search = params.toString();
    router.replace(url.toString(), { scroll: false });
  };

  // Handle JSON editor changes
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = e.target.value;
    setJsonValue(value);

    try {
      const parsedProps = JSON.parse(value);
      setLocalProps(parsedProps);
      updateURLWithProps(parsedProps);
      setJsonError(null);
    } catch (error) {
      if (error instanceof Error) {
        setJsonError(error.message);
      } else {
        setJsonError('Invalid JSON');
      }
    }
  };

  // Reset props to defaults
  const resetToDefaults = async (): Promise<void> => {
    try {
      // Load default props from the template
      const EmailModule = await import(`@/components/email/template/${emailType}`);
      const defaultProps = EmailModule.default?.defaultProps || {};

      // Update local state and URL
      setLocalProps(defaultProps);
      updateURLWithProps(defaultProps);
      setJsonValue(JSON.stringify(defaultProps, null, 2));
    } catch (error) {
      console.error('Error resetting to defaults:', error);
    }
  };

  // Toggle expanded/collapsed state
  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  // Send test email handler
  const sendTestEmailHandler = async (): Promise<void> => {
    if (!testEmailRecipient) {
      toast.error('Please provide a recipient email address.');
      return;
    }

    try {
      setIsSending(true);

      // Use the server action with template name instead of component reference
      await sendTestEmail({
        templateName: emailType,
        props: localProps,
        to: testEmailRecipient,
        subject: `[Test] ${toTitleCase(emailType)} Email`,
      });

      toast.success(`Email successfully sent to ${testEmailRecipient}`);
      setIsTestEmailDialogOpen(false);
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsSending(false);
    }
  };

  // Main render
  if (!isVisible) {
    return (
      <div className="relative">
        <button
          onClick={toggleVisibility}
          className="bg-primary text-primary-foreground absolute -top-[30px] right-0 z-50 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium shadow-md transition-transform hover:scale-105"
        >
          <SlidersIcon size={12} />
          <span>Configure</span>
        </button>
        <div className="light">{children}</div>
      </div>
    );
  }

  return (
    <>
      {/* Test Email Dialog */}
      <Dialog open={isTestEmailDialogOpen} onOpenChange={setIsTestEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground mb-4 text-sm">
              Send a test email using the current configuration to verify how it looks in your email
              client.
            </p>
            <div className="space-y-2">
              <label htmlFor="recipient" className="text-sm font-medium">
                Recipient Email
              </label>
              <Input
                id="recipient"
                type="email"
                placeholder="you@example.com"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTestEmailDialogOpen(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={() => sendTestEmailHandler()} disabled={isSending} className="gap-1.5">
              {isSending ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon size={14} />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Focus mode panel */}
      {isVisible && (
        <div
          ref={panelRef}
          className="bg-background/95 fixed inset-0 z-40 backdrop-blur-sm transition-all duration-300 ease-out"
          style={{
            transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
            opacity: isVisible ? 1 : 0,
          }}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-border/20 flex h-16 items-center justify-between border-b px-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <SlidersIcon size={16} className="text-primary" />
                  <span className="text-lg font-medium">Props Configuration</span>
                  <Badge variant="secondary" className="h-5 text-xs">
                    {Object.keys(schemaInfo).length} props
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setIsTestEmailDialogOpen(true)}
                >
                  <SendIcon size={14} />
                  Send Test Email
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs"
                  onClick={resetToDefaults}
                >
                  <RotateCwIcon size={14} />
                  Reset defaults
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={toggleVisibility}
                >
                  <XIcon size={14} />
                  Exit focus mode
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <div className="flex h-full">
                {/* Left side - Email preview */}
                <div className="border-border/20 w-1/2 border-r p-6">
                  <div className="pointer-events-auto sticky top-6 z-40">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <EyeIcon size={14} className="text-primary/70" />
                        <span className="text-muted-foreground text-sm">Live preview</span>
                      </div>
                      <div className="border-border/40 flex items-center gap-1 rounded-md border p-0.5 shadow-sm">
                        <button
                          onClick={() => setSelectedDevice('mobile')}
                          className={`flex size-7 items-center justify-center rounded transition-colors ${
                            selectedDevice === 'mobile'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-foreground/70 hover:bg-muted'
                          }`}
                          title="Mobile view (375px)"
                          aria-label="Mobile view"
                        >
                          <SmartphoneIcon size={14} />
                        </button>
                        <button
                          onClick={() => setSelectedDevice('desktop')}
                          className={`flex size-7 items-center justify-center rounded transition-colors ${
                            selectedDevice === 'desktop'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-foreground/70 hover:bg-muted'
                          }`}
                          title="Desktop view (full width)"
                          aria-label="Desktop view"
                        >
                          <MonitorIcon size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <div
                        className="light border-border/20 bg-card rounded-lg border p-4 shadow-sm transition-all duration-300 ease-in-out"
                        style={{
                          width: containerWidth,
                          maxWidth: '100%',
                          transform: selectedDevice === 'mobile' ? 'scale(0.95)' : 'scale(1)',
                        }}
                      >
                        {children}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side - Props configuration */}
                <div className="w-1/2 overflow-y-auto p-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="controls" className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <SlidersIcon size={12} />
                          Controls
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="json" className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <CodeIcon size={12} />
                          JSON
                        </div>
                      </TabsTrigger>
                    </TabsList>

                    <div className="py-4">
                      <div className="from-primary/5 to-primary/0 mb-3 flex items-center gap-1.5 rounded bg-gradient-to-r px-3 py-1.5 text-xs">
                        <EyeIcon size={12} className="text-primary/70" />
                        <span className="text-primary-foreground/70">
                          Changes applied instantly
                        </span>
                      </div>
                    </div>

                    <TabsContent value="controls" className="m-0">
                      <div className="space-y-4">
                        {isSchemaLoading ? (
                          <div className="flex items-center justify-center p-8">
                            <div className="text-center">
                              <div className="border-primary mx-auto mb-2 h-4 w-4 animate-spin rounded-full border-b-2"></div>
                              <p className="text-muted-foreground text-xs">Loading schema...</p>
                            </div>
                          </div>
                        ) : Object.keys(schemaInfo).length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(schemaInfo).map(([key, info]) => (
                              <div
                                key={key}
                                className="hover:border-border/20 hover:bg-muted/20 bg-card/50 group space-y-1.5 rounded-lg border border-transparent p-3 transition-all hover:shadow-sm"
                              >
                                <div className="flex items-start justify-between">
                                  <label className="text-sm font-medium" htmlFor={key}>
                                    {key}
                                    {info.isOptional ? '' : ' *'}
                                    {info.format && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        {info.format}
                                      </Badge>
                                    )}
                                  </label>
                                  <Badge
                                    variant="secondary"
                                    className="text-muted-foreground text-[10px] font-normal"
                                  >
                                    {info.type}
                                  </Badge>
                                </div>

                                {info.description && (
                                  <p className="text-muted-foreground text-xs">
                                    {info.description}
                                  </p>
                                )}

                                {info.type === 'boolean' ? (
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id={key}
                                      checked={localProps[key] === true}
                                      onCheckedChange={(checked) => handleInputChange(key, checked)}
                                    />
                                    <label htmlFor={key} className="text-muted-foreground text-xs">
                                      {localProps[key] ? 'Enabled' : 'Disabled'}
                                    </label>
                                  </div>
                                ) : info.type === 'string' &&
                                  (localProps[key]?.toString()?.length || 0) > 100 ? (
                                  <Textarea
                                    id={key}
                                    value={localProps[key]?.toString() || ''}
                                    onChange={(e) => handleInputChange(key, e.target.value)}
                                    className="h-20 resize-none text-sm"
                                  />
                                ) : (
                                  <Input
                                    id={key}
                                    type={info.type === 'number' ? 'number' : 'text'}
                                    value={localProps[key]?.toString() || ''}
                                    onChange={(e) => {
                                      const value =
                                        info.type === 'number'
                                          ? parseFloat(e.target.value)
                                          : e.target.value;
                                      handleInputChange(key, value);
                                    }}
                                    className="h-8 text-sm"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-muted-foreground text-sm">No properties found</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="json" className="m-0">
                      <div className="border-border/20 overflow-hidden rounded-lg border">
                        <Textarea
                          className="min-h-[400px] resize-none font-mono text-xs"
                          value={jsonValue}
                          onChange={handleJsonChange}
                          spellCheck={false}
                        />
                      </div>

                      {jsonError && (
                        <div className="bg-destructive/10 text-destructive mt-2 rounded px-3 py-1.5 text-xs">
                          {jsonError}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
